// ==UserScript==
// @name         Screener Helper
// @namespace    https://github.com/DanielRoig/screener-extension
// @version      2.0
// @description  Añade celdas personalizadas en la tabla de adaytrading.com/screener
// @author       TU_NOMBRE
// @match        https://adaytrading.com/screener
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @connect      api.nasdaq.com
// @run-at       document-end
// @downloadURL  https://github.com/DanielRoig/extension-screener/raw/refs/heads/main/screener-helper.user.js
// @updateURL    https://github.com/DanielRoig/extension-screener/raw/refs/heads/main/screener-helper.user.js
// ==/UserScript==

(function () {
  "use strict";

  // ----------------------------------------------------------------------
  // Types (for clarity)
  // ----------------------------------------------------------------------
  /** @typedef {Record<string, string>} NoncompliantList */

  // ----------------------------------------------------------------------
  // Storage reset
  // ----------------------------------------------------------------------
  /**
   * Clears all values stored by this script in Tampermonkey storage.
   */
  function resetStorage() {
    GM_listValues().forEach((key) => GM_deleteValue(key));
  }

  // ----------------------------------------------------------------------
  // API fetch (replaces background.ts + chrome.runtime.sendMessage)
  // ----------------------------------------------------------------------
  /**
   * Fetches the list of noncompliant companies from Nasdaq API.
   * @returns {Promise<any>} The parsed JSON response.
   */
  function fetchNasdaqData() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: "https://api.nasdaq.com/api/quote/list-type-extended/listing?queryString=deficient",
        onload: function (res) {
          if (res.status >= 200 && res.status < 300) {
            try {
              const data = JSON.parse(res.responseText);
              resolve(data);
            } catch (e) {
              reject(new Error("Invalid JSON response"));
            }
          } else {
            reject(new Error(`HTTP error! status: ${res.status}`));
          }
        },
        onerror: function () {
          reject(new Error("Network error"));
        },
      });
    });
  }

  /**
   * Parses a date string in "MM/DD/YYYY" format.
   * @param {string} dateStr
   * @returns {Date}
   */
  function parseNotificationDate(dateStr) {
    const [month, day, year] = dateStr.split("/").map(Number);
    return new Date(year, month - 1, day);
  }

  /**
   * Fetches the noncompliant companies, builds a symbol→notificationDate map,
   * and stores it in Tampermonkey storage under the key "Noncompliant".
   * @returns {Promise<void>}
   */
  async function fetchNoncompliantCompanies() {
    try {
      const response = await fetchNasdaqData();

      // Extract the relevant part of the response
      const rows = response?.data?.noncomplaintCompanyList?.rows;
      if (!rows || !Array.isArray(rows)) {
        console.warn("Unexpected API response structure");
        return;
      }

      /** @type {NoncompliantList} */
      const noncompliantList = {};

      rows.forEach((row) => {
        const companies = row.companies;
        if (!Array.isArray(companies)) return;
        companies.forEach((company) => {
          const affected = company.AffectedIssues;
          if (!Array.isArray(affected)) return;
          affected.forEach((symbol) => {
            // Use ISO string for consistent storage
            noncompliantList[symbol] = parseNotificationDate(
              company.NotificationDate,
            ).toISOString();
          });
        });
      });

      GM_setValue("Noncompliant", JSON.stringify(noncompliantList));
    } catch (err) {
      console.error("Error fetching noncompliant companies:", err);
    }
  }

  /**
   * Retrieves the noncompliant list from Tampermonkey storage.
   * @returns {NoncompliantList|null}
   */
  function getNoncompliantFromStorage() {
    const stored = GM_getValue("Noncompliant", null);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Checks if a symbol is noncompliant and returns the notification date if so.
   * @param {string} symbol
   * @returns {Date|null}
   */
  function isNoncompliant(symbol) {
    const list = getNoncompliantFromStorage();
    if (list && list[symbol]) {
      return new Date(list[symbol]);
    }
    return null;
  }

  // ----------------------------------------------------------------------
  // Table manipulation (based on index.ts)
  // ----------------------------------------------------------------------
  /**
   * Adds a cell with the noncompliant info to a table row.
   * @param {HTMLTableRowElement} row
   * @param {Record<string, unknown>} data - Object with keys Noti, Dead, Remain
   */
  function addCell(row, data) {
    const cell = document.createElement("td");
    cell.className = "cell100 column8-ch smallPadding";

    const entries = Object.entries(data);
    entries.forEach(([key, value], index) => {
      cell.appendChild(document.createTextNode(`${key}: ${value}`));
      if (index < entries.length - 1) {
        cell.appendChild(document.createElement("br"));
      }
    });

    row.appendChild(cell);
  }

  /**
   * Processes all rows of the table with id "bodyTaulaChange".
   * For each row, if it doesn't already have a column8-ch cell, it computes
   * noncompliant data and appends it.
   */
  function processRows() {
    const table = document.getElementById("bodyTaulaChange");
    if (!table) return;

    const rows = table.querySelectorAll("tr");
    rows.forEach((row) => {
      // Avoid duplicate processing
      if (row.querySelector(".column8-ch")) return;

      const symbol = row.getAttribute("name");
      if (!symbol) return;

      const notifDate = isNoncompliant(symbol);

      let data = GM_getValue(symbol, null);

      if (!data) {
        if (notifDate) {
          console.log("Symbol:", symbol, "Notification Date:", notifDate);
          const deadline = new Date(notifDate);
          deadline.setDate(deadline.getDate() + 180);

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const diffTime = deadline.getTime() - today.getTime();
          const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          data = {
            Noti: notifDate.toISOString().split("T")[0], // YYYY-MM-DD
            Dead: deadline.toISOString().split("T")[0],
            Remain: daysRemaining.toString(),
          };
        } else {
          data = {
            Noti: "no",
            Dead: "no",
            Remain: "no",
          };
        }

        data = JSON.stringify(data);

        GM_setValue(symbol, data);
      }
      addCell(row, JSON.parse(data));
    });
  }

  /**
   * Starts a MutationObserver on the table to handle dynamic content.
   * Also runs an initial processing.
   */
  function startObserver() {
    const table = document.getElementById("bodyTaulaChange");
    if (!table) {
      // Retry after a short delay if table not found
      setTimeout(startObserver, 2000);
      return;
    }

    const observer = new MutationObserver(processRows);
    observer.observe(table, { childList: true, subtree: true });

    // Initial processing
    processRows();
  }

  // ----------------------------------------------------------------------
  // Initialization & URL change detection
  // ----------------------------------------------------------------------
  // Ensure the noncompliant list is fetched before we start observing
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", async () => {
      resetStorage();
      await fetchNoncompliantCompanies();
      startObserver();
    });
  } else {
    resetStorage();
    fetchNoncompliantCompanies().then(() => startObserver());
  }

  // Detect URL changes (e.g., single-page app navigation) and restart if needed
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      if (url.includes("/screener")) {
        // Give the new page a moment to render the table
        setTimeout(startObserver, 1000);
      }
    }
  }).observe(document, { subtree: true, childList: true });
})();
