// ==UserScript==
// @name         Screener Helper
// @namespace    https://github.com/DanielRoig/screener-extension
// @version      2.0
// @description  Añade celdas personalizadas en la tabla de adaytrading.com/screener
// @author       Daniel Roig
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

  function isNoncompliant(symbol) {
    const list = getNoncompliantFromStorage();
    if (list && list[symbol]) {
      return new Date(list[symbol]);
    }
    return null;
  }

  function addCell(row, data) {
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

    row.appendChild(cell);
  }

  function addNoncompliant(symbol) {
    const notifDate = isNoncompliant(symbol);
    if (notifDate) {
      console.log("Symbol:", symbol, "Notification Date:", notifDate);
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
      return "       ";
    }
  }

  function processRows() {
    const table = document.getElementById("bodyTaulaChange");
    if (!table) return;

    const rows = table.querySelectorAll("tr");
    rows.forEach((row) => {
      if (row.querySelector(".column8-ch")) return;

      const symbol = row.getAttribute("name");
      if (!symbol) return;

      let data = GM_getValue(symbol, null);

      if (!data) {
        data = {
          noncompliant: addNoncompliant(symbol),
          daniel: "roig",
        };
        data = JSON.stringify(data);
        GM_setValue(symbol, data);
      }
      const parsed = JSON.parse(data);
      Object.keys(parsed).forEach((key) => {
        if (parsed[key] !== null) {
          addCell(row, parsed[key]);
        }
      });
    });
  }

  function startObserver() {
    const table = document.getElementById("bodyTaulaChange");
    if (!table) {
      setTimeout(startObserver, 2000);
      return;
    }

    const observer = new MutationObserver(processRows);
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
