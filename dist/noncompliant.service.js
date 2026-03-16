"use strict";
function parseNotificationDate(dateStr) {
    const [month, day, year] = dateStr.split("/").map(Number);
    return new Date(year, month - 1, day);
}
async function fetchNoncompliantCompanies() {
    try {
        const response = (await chrome.runtime.sendMessage({
            action: "fetchNoncompliant",
        }));
        if (!response.success || !response.data) {
            return;
        }
        const noncompliantList = {};
        response.data.data.noncomplaintCompanyList.rows.forEach((row) => {
            row.companies.forEach((company) => {
                company.AffectedIssues.forEach((symbol) => {
                    noncompliantList[symbol] = parseNotificationDate(company.NotificationDate).toISOString();
                });
            });
        });
        localStorage.setItem("Noncompliant", JSON.stringify(noncompliantList));
    }
    catch (_a) {
        console.error("Error fetching noncompliant companies");
    }
}
function getNoncompliantFromStorage() {
    const stored = localStorage.getItem("Noncompliant");
    if (stored) {
        return JSON.parse(stored);
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
