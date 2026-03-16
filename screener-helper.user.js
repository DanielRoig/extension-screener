// ==UserScript==
// @name         Screener Helper
// @namespace    https://github.com/DanielRoig/screener-extension
// @version      2.0
// @description  Añade celdas personalizadas en la tabla de adaytrading.com/screener
// @author       TU_NOMBRE
// @match        https://adaytrading.com/screener
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @connect      api.nasdaq.com
// @run-at       document-end
// @downloadURL  https://github.com/DanielRoig/extension-screener/raw/refs/heads/main/screener-helper.user.js
// @updateURL    https://github.com/DanielRoig/extension-screener/raw/refs/heads/main/screener-helper.user.js
// ==/UserScript==

(function () {
  "use strict";

  // Constantes
  const STORAGE_KEYS = {
    NONCOMPLIANT: "Noncompliant",
  };

  // Función para obtener datos de Nasdaq usando la nueva API
  async function fetchNoncompliantCompanies() {
    try {
      const response = await GM.xmlHttpRequest({
        method: "GET",
        url: "https://api.nasdaq.com/api/quote/list-type-extended/listing?queryString=deficient",
        responseType: "json",
        onload: (res) => res,
        onerror: (err) => {
          throw new Error("Network error");
        },
      });

      if (response.status >= 200 && response.status < 300) {
        const data = response.response;

        if (!data || !data.data) {
          throw new Error("Invalid response format");
        }

        const noncompliantList = {};

        data.data.noncomplaintCompanyList.rows.forEach((row) => {
          row.companies.forEach((company) => {
            company.AffectedIssues.forEach((symbol) => {
              noncompliantList[symbol] = company.NotificationDate;
            });
          });
        });

        // Guardar usando la nueva API
        await GM.setValue(STORAGE_KEYS.NONCOMPLIANT, noncompliantList);
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error("Error fetching noncompliant companies:", error);
    }
  }

  // Obtener datos del storage usando la nueva API
  async function getNoncompliantFromStorage() {
    try {
      const stored = await GM.getValue(STORAGE_KEYS.NONCOMPLIANT, null);
      return stored;
    } catch (error) {
      console.error("Error reading from storage:", error);
      return null;
    }
  }

  // Verificar si es noncompliant
  async function isNoncompliant(symbol) {
    const list = await getNoncompliantFromStorage();
    if (list && list[symbol]) {
      return new Date(list[symbol]);
    }
    return null;
  }

  // Obtener valor de una acción específica
  async function getStockValue(symbol) {
    try {
      return await GM.getValue(symbol, null);
    } catch (error) {
      console.error(`Error getting value for ${symbol}:`, error);
      return null;
    }
  }

  // Guardar valor de una acción específica
  async function setStockValue(symbol, value) {
    try {
      await GM.setValue(symbol, value);
    } catch (error) {
      console.error(`Error setting value for ${symbol}:`, error);
    }
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

  // Procesar filas (ahora async)
  async function processRows() {
    const rows = document.querySelectorAll("#bodyTaulaChange tr");

    for (const row of rows) {
      if (!row.querySelector(".column8-ch")) {
        const name = row.getAttribute("name");
        if (!name) {
          continue;
        }

        let value = await getStockValue(name);
        let newValue;

        if (value === null) {
          const noncompliantDate = await isNoncompliant(name);
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
          await setStockValue(name, newValue);
        } else {
          newValue = value;
        }

        addCell(row, newValue);
      }
    }
  }

  // Iniciar observer
  function startObserver() {
    const tabla = document.getElementById("bodyTaulaChange");
    if (tabla) {
      // Procesar filas iniciales
      processRows().catch(console.error);

      // Configurar observer para cambios futuros
      const observador = new MutationObserver(() => {
        processRows().catch(console.error);
      });
      observador.observe(tabla, { childList: true, subtree: true });
    } else {
      setTimeout(startObserver, 2000);
    }
  }

  // Función para limpiar datos antiguos (opcional)
  async function cleanupOldData() {
    // Esta función requeriría listar todas las keys, lo cual no es posible
    // directamente con la API de GM. Se puede implementar un sistema de
    // limpieza basado en fechas si se guarda un timestamp.
    console.log("Cleanup function - implement if needed");
  }

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
