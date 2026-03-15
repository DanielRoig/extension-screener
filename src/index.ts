function addCell(
  fila: HTMLTableRowElement,
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

  fila.appendChild(celda);
}

function procesarFilas(): void {
  document
    .querySelectorAll<HTMLTableRowElement>("#bodyTaulaChange tr")
    .forEach((fila) => {
      if (!fila.querySelector(".column8-ch")) {
        const name = fila.getAttribute("name");
        if (!name) {
          return;
        }

        let value = localStorage.getItem(name);
        let newValue = JSON.parse(value);
        console.log(value);
        if (value === null) {
          const noncompliantDate = isNoncompliant(name);
          if (noncompliantDate) {
            const deadline = new Date(noncompliantDate);
            deadline.setDate(deadline.getDate() + 180);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const daysRemaining = Math.ceil(
              (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
            );
            const fmt = (d: Date): string =>
              `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
            newValue = {
              Noti: fmt(new Date(noncompliantDate)),
              Dead: fmt(deadline),
              Remain: `${daysRemaining}`,
            };
          } else {
            newValue = {
              Noti: "suu",
              Dead: "suu",
              Remain: "suu",
            };
          }
          localStorage.setItem(name, JSON.stringify(newValue));
        }

        addCell(fila, newValue);
      }
    });
}

function iniciarObservador(): void {
  const tabla = document.getElementById("bodyTaulaChange");
  if (tabla) {
    const observador = new MutationObserver(procesarFilas);
    observador.observe(tabla, { childList: true, subtree: true });

    procesarFilas();
  } else {
    setTimeout(iniciarObservador, 2000);
  }
}

localStorage.clear();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", async () => {
    await fetchNoncompliantCompanies();
    iniciarObservador();
  });
} else {
  fetchNoncompliantCompanies().then(() => iniciarObservador());
}

let lastUrl: string = location.href;
new MutationObserver((): void => {
  const url: string = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    if (url.includes("/screener")) {
      setTimeout(iniciarObservador, 1000);
    }
  }
}).observe(document, { subtree: true, childList: true });
