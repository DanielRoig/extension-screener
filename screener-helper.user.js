// ==UserScript==
// @name         Screener Helper
// @namespace    https://github.com/TU_USUARIO/screener-helper
// @version      1.0
// @description  Añade celdas personalizadas en la tabla de adaytrading.com/screener
// @author       TU_NOMBRE
// @match        https://adaytrading.com/screener
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.nasdaq.com
// @run-at       document-end
// @downloadURL  https://github.com/TU_USUARIO/screener-helper/raw/main/screener-helper.user.js
// @updateURL    https://github.com/TU_USUARIO/screener-helper/raw/main/screener-helper.user.js
// ==/UserScript==

(function () {
  "use strict";

  // Constantes
  const STORAGE_KEYS = {
    NONCOMPLIANT: "Noncompliant",
  };

  // Tipos (simulados en JS)
  // interface NasdaqResponse { ... }
  // type NoncompliantList = Record<string, string>;

  // Función para parsear fecha
  function parseNotificationDate(dateStr) {
    const [month, day, year] = dateStr.split("/").map(Number);
    return new Date(year, month - 1, day);
  }

  // Función para obtener datos de Nasdaq
  async function fetchNoncompliantCompanies() {
    try {
      const response = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: "https://api.nasdaq.com/api/quote/list-type-extended/listing?queryString=deficient",
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              try {
                const data = JSON.parse(res.responseText);
                resolve({ success: true, data });
              } catch (e) {
                reject(new Error("Error parsing response"));
              }
            } else {
              reject(new Error(`HTTP error! status: ${res.status}`));
            }
          },
          onerror: (err) => reject(new Error("Network error")),
        });
      });

      if (!response.success || !response.data) {
        return;
      }

      const noncompliantList = {};

      response.data.data.noncomplaintCompanyList.rows.forEach((row) => {
        row.companies.forEach((company) => {
          company.AffectedIssues.forEach((symbol) => {
            noncompliantList[symbol] = parseNotificationDate(
              company.NotificationDate,
            ).toISOString();
          });
        });
      });

      // Guardar en GM_setValue en lugar de localStorage
      GM_setValue(STORAGE_KEYS.NONCOMPLIANT, JSON.stringify(noncompliantList));
    } catch (error) {
      console.error("Error fetching noncompliant companies:", error);
    }
  }

  // Obtener datos del storage
  function getNoncompliantFromStorage() {
    const stored = GM_getValue(STORAGE_KEYS.NONCOMPLIANT, null);
    if (stored) {
      return JSON.parse(stored);
    }
    return null;
  }

  // Verificar si es noncompliant
  function isNoncompliant(symbol) {
    const list = getNoncompliantFromStorage();
    if (list && list[symbol]) {
      return new Date(list[symbol]);
    }
    return null;
  }

  // Añadir celda a la fila
  function addCell(row, valor) {
    const celda = document.createElement("td");
    celda.className = "cell100 column8-ch smallPadding";

    const entries = Object.entries(valor);
    entries.forEach(([k, v], i) => {
      celda.appendChild(document.createTextNode(`${k}: ${v}`));
      if (i < entries.length - 1) {
        celda.appendChild(document.createElement("br"));
      }
    });

    row.appendChild(celda);
  }

  // Procesar filas
  function processRows() {
    document.querySelectorAll("#bodyTaulaChange tr").forEach((row) => {
      if (!row.querySelector(".column8-ch")) {
        const name = row.getAttribute("name");
        if (!name) {
          return;
        }

        let value = GM_getValue(name, null);
        let newValue;

        if (value === null) {
          const noncompliantDate = isNoncompliant(name);
          if (noncompliantDate) {
            const deadlineDate = new Date(noncompliantDate);
            deadlineDate.setDate(deadlineDate.getDate() + 180);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const daysRemaining = Math.ceil(
              (deadlineDate.getTime() - today.getTime()) /
                (1000 * 60 * 60 * 24),
            );

            newValue = {
              Noti: noncompliantDate.toISOString().split("T")[0],
              Dead: deadlineDate.toISOString().split("T")[0],
              Remain: `${daysRemaining}`,
            };
          } else {
            newValue = {
              Noti: null,
              Dead: null,
              Remain: null,
            };
          }
          GM_setValue(name, JSON.stringify(newValue));
        } else {
          newValue = JSON.parse(value);
        }

        addCell(row, newValue);
      }
    });
  }

  // Iniciar observer
  function startObserver() {
    const tabla = document.getElementById("bodyTaulaChange");
    if (tabla) {
      const observador = new MutationObserver(processRows);
      observador.observe(tabla, { childList: true, subtree: true });

      processRows();
    } else {
      setTimeout(startObserver, 2000);
    }
  }

  // Limpiar datos antiguos (opcional)
  // No podemos usar localStorage.clear() fácilmente, así que omitimos o implementamos limpieza selectiva

  // Inicialización
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", async () => {
      await fetchNoncompliantCompanies();
      startObserver();
    });
  } else {
    fetchNoncompliantCompanies().then(() => startObserver());
  }

  // Observer para cambios de URL (SPA)
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
