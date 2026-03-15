interface NasdaqResponse {
  data: {
    noncomplaintCompanyList: {
      rows: Array<{
        IssuerName: string;
        companies: Array<{
          Deficiency: string;
          Market: string;
          NotificationDate: string;
          AffectedIssues: string[];
        }>;
      }>;
    };
  };
}

type NoncompliantList = Record<string, string>;

function parseNotificationDate(dateStr: string): Date {
  const [month, day, year] = dateStr.split("/").map(Number);
  return new Date(year, month - 1, day);
}

async function fetchNoncompliantCompanies(): Promise<void> {
  try {
    const response = (await chrome.runtime.sendMessage({
      action: "fetchNoncompliant",
    })) as { success: boolean; data?: NasdaqResponse; error?: string };

    if (!response.success || !response.data) {
      return;
    }

    const noncompliantList: NoncompliantList = {};

    response.data.data.noncomplaintCompanyList.rows.forEach((row) => {
      row.companies.forEach((company) => {
        company.AffectedIssues.forEach((symbol) => {
          noncompliantList[symbol] = parseNotificationDate(
            company.NotificationDate,
          ).toISOString();
        });
      });
    });

    localStorage.setItem("Noncompliant", JSON.stringify(noncompliantList));
  } catch {
    console.error("Error fetching noncompliant companies");
  }
}

function getNoncompliantFromStorage(): NoncompliantList | null {
  const stored = localStorage.getItem("Noncompliant");
  if (stored) {
    return JSON.parse(stored) as NoncompliantList;
  }
  return null;
}

function isNoncompliant(symbol: string): Date | null {
  const list = getNoncompliantFromStorage();
  if (list && list[symbol]) {
    return new Date(list[symbol]);
  }
  return null;
}
