// ==UserScript==
// @name         Screener Helper
// @namespace    https://github.com/DanielRoig/screener-extension
// @version      3.0
// @description  Añade celdas personalizadas en la tabla de adaytrading.com/screener
// @author       Daniel Roig
// @match        https://adaytrading.com/screener
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @connect      api.nasdaq.com
// @connect      api.dilutiontracker.com
// @run-at       document-end
// @downloadURL  https://github.com/DanielRoig/extension-screener/raw/refs/heads/main/screener-helper.user.js
// @updateURL    https://github.com/DanielRoig/extension-screener/raw/refs/heads/main/screener-helper.user.js
// ==/UserScript==

(function () {
  "use strict";

  function resetStorage() {
    GM_listValues().forEach((key) => GM_deleteValue(key));
  }

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

  function fetchDilutionTrackerData(symbol) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: `https://api.dilutiontracker.com/v1/getCompanyProfile?ticker=${symbol}`,
        onload: function (res) {
          if (res.status === 404) {
            resolve(false);
          } else {
            resolve(true);
          }
        },
        onerror: function () {
          resolve("error");
        },
      });
    });
  }

  function parseNotificationDate(dateStr) {
    const [month, day, year] = dateStr.split("/").map(Number);
    return new Date(year, month - 1, day);
  }

  async function fetchNoncompliantCompanies() {
    try {
      const response = await fetchNasdaqData();

      const rows = response?.data?.noncomplaintCompanyList?.rows;
      if (!rows || !Array.isArray(rows)) {
        console.warn("Unexpected API response structure");
        return;
      }

      const noncompliantList = {};

      rows.forEach((row) => {
        const companies = row.companies;
        if (!Array.isArray(companies)) return;
        companies.forEach((company) => {
          const affected = company.AffectedIssues;
          if (!Array.isArray(affected)) return;
          affected.forEach((symbol) => {
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

  function isNoncompliant(symbol) {
    const list = JSON.parse(GM_getValue("Noncompliant", null));
    if (list && list[symbol]) {
      return new Date(list[symbol]);
    }
    return null;
  }

  function addCell(row, data, appendToStart = false) {
    const cell = document.createElement("td");
    cell.className = "cell100 column8-ch smallPadding";
    if (typeof data === "object") {
      const entries = Object.entries(data);
      entries.forEach(([key, value], index) => {
        cell.appendChild(document.createTextNode(`${key}: ${value}`));
        if (index < entries.length - 1) {
          cell.appendChild(document.createElement("br"));
        }
      });
    } else {
      cell.appendChild(document.createTextNode(data));
    }

    if (appendToStart) {
      row.insertBefore(cell, row.firstChild);
    } else {
      row.appendChild(cell);
    }
  }

  function addNoncompliant(symbol) {
    const notifDate = isNoncompliant(symbol);
    if (notifDate) {
      const deadline = new Date(notifDate);
      deadline.setDate(deadline.getDate() + 180);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = deadline.getTime() - today.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return {
        Noti: notifDate.toISOString().split("T")[0],
        Dead: deadline.toISOString().split("T")[0],
        Remain: daysRemaining.toString(),
      };
    } else {
      return null;
    }
  }

  async function processRows() {
    const table = document.getElementById("bodyTaulaChange");
    if (!table) return;

    for (const row of table.querySelectorAll("tr")) {
      if (row.querySelector(".column8-ch")) continue;

      const symbol = row.getAttribute("name");
      if (!symbol) continue;

      let symbolData = GM_getValue(symbol, null);

      if (!symbolData) {
        try {
          const dilutionResult = await fetchDilutionTrackerData(symbol);

          symbolData = JSON.stringify({
            noncompliant: addNoncompliant(symbol),
            daniel: "roig",
            dilutionTracker: dilutionResult,
          });

          GM_setValue(symbol, symbolData);
        } catch (error) {
          console.error(`Error fetching data for ${symbol}:`, error);
          continue;
        }
      }

      const parsedData = JSON.parse(symbolData);
      if (parsedData["dilutionTracker"] == false) {
        row.remove();
        continue;
      }

      if (parsedData["noncompliant"] != null) {
        addCell(row, parsedData["noncompliant"]);
      }
    }
  }

  function processPositionsData() {
    const positionsDiv = document.getElementById("positionsData");
    if (!positionsDiv) return;

    const table = positionsDiv.querySelector("table");
    if (!table) return;

    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    const rows = tbody.querySelectorAll("tr");
    rows.forEach((row) => {
      const td = row.querySelector("td");
      if (td && !td.hasAttribute("onclick")) {
        const symbolText = td.textContent.trim().split(".")[0];

        const originalContent = td.innerHTML;
        td.innerHTML = `<span name="${symbolText}" style="cursor:pointer;" onclick="newtab(this)">${originalContent}</span>`;
      }
    });
  }

  function startObserver() {
    const table = document.getElementById("bodyTaulaChange");
    if (!table) {
      setTimeout(startObserver, 2000);
      return;
    }

    const observer = new MutationObserver(() => {
      processRows();
      processPositionsData();
    });

    observer.observe(table, { childList: true, subtree: true });

    processRows();
  }

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

  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      if (url.includes("/screener")) {
        setTimeout(startObserver, 1000);
      }
    }
  }).observe(document, { subtree: true, childList: true });
})();
