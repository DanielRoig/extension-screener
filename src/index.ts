function addCell(
  row: HTMLTableRowElement,
  valor: Record<string, unknown>,
): void {
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

function processRows(): void {
  document
    .querySelectorAll<HTMLTableRowElement>("#bodyTaulaChange tr")
    .forEach((row) => {
      if (!row.querySelector(".column8-ch")) {
        const name = row.getAttribute("name");
        if (!name) {
          return;
        }

        let value = localStorage.getItem(name);
        let newValue = JSON.parse(value);
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
              Noti: noncompliantDate,
              Dead: deadlineDate,
              Remain: `${daysRemaining}`,
            };
          } else {
            newValue = {
              Noti: null,
              Dead: null,
              Remain: null,
            };
          }
          localStorage.setItem(name, JSON.stringify(newValue));
        }

        addCell(row, newValue);
      }
    });
}

function startObserver(): void {
  const tabla = document.getElementById("bodyTaulaChange");
  if (tabla) {
    const observador = new MutationObserver(processRows);
    observador.observe(tabla, { childList: true, subtree: true });

    processRows();
  } else {
    setTimeout(startObserver, 2000);
  }
}

localStorage.clear();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", async () => {
    await fetchNoncompliantCompanies();
    startObserver();
  });
} else {
  fetchNoncompliantCompanies().then(() => startObserver());
}

let lastUrl: string = location.href;
new MutationObserver((): void => {
  const url: string = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    if (url.includes("/screener")) {
      setTimeout(startObserver, 1000);
    }
  }
}).observe(document, { subtree: true, childList: true });
