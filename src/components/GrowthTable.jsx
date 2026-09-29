// src/components/GrowthTable.jsx

import React, { useMemo } from "react";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

/* =========================================================
   CONFIG
========================================================= */

const DEFAULT_PAGE_SIZE_OPTIONS = Object.freeze([
  10,
  25,
  50,
  100,
]);

/* =========================================================
   HELPERS
========================================================= */

const toNumber = (value, fallback = 0) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
};

const formatInteger = (value) =>
  toNumber(value).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });

const formatAmount = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return "—";
  }

  return parsed.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatPercent = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return "—";
  }

  return `${
    parsed > 0 ? "+" : ""
  }${parsed.toLocaleString("en-IN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })}%`;
};

const formatPeriod = (value) => {
  const period = String(value ?? "").trim();

  if (!/^(0[1-9]|1[0-2])\d{4}$/.test(period)) {
    return period || "—";
  }

  const month = Number(period.substring(0, 2));
  const year = Number(period.substring(2));

  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
};

const formatTrend = (value) => {
  const trend = String(value ?? "").trim();

  if (!trend) {
    return "—";
  }

  return trend
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getTrendClass = (value) => {
  const trend = String(value ?? "").toUpperCase();

  if (
    trend.includes("DECLIN") ||
    trend.includes("NEGATIVE")
  ) {
    return "declining";
  }

  if (
    trend.includes("GROW") ||
    trend.includes("POSITIVE")
  ) {
    return "growing";
  }

  return "stable";
};

const getGrowthClass = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "growth-neutral";
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return "growth-neutral";
  }

  if (parsed > 0) {
    return "growth-positive";
  }

  if (parsed < 0) {
    return "growth-negative";
  }

  return "growth-neutral";
};

/* =========================================================
   PAGE NUMBERS

   Example:
   1 2 3 4 5
   4 5 6 7 8
========================================================= */

const buildPageNumbers = (
  currentPage,
  totalPages,
  maxButtons = 5
) => {
  if (totalPages <= 0) {
    return [];
  }

  if (totalPages <= maxButtons) {
    return Array.from(
      { length: totalPages },
      (_, index) => index
    );
  }

  const half = Math.floor(maxButtons / 2);

  let start = Math.max(
    0,
    currentPage - half
  );

  let end = start + maxButtons;

  if (end > totalPages) {
    end = totalPages;
    start = Math.max(0, end - maxButtons);
  }

  return Array.from(
    { length: end - start },
    (_, index) => start + index
  );
};

/* =========================================================
   COMPONENT
========================================================= */

export default function GrowthTable({
  data = null,
  loading = false,

  page = 0,
  pageSize = 25,

  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,

  selectedGstin = "",

  onSelectGstin = () => {},
  onPageChange = () => {},
  onPageSizeChange = () => {},
}) {
  /* =======================================================
     NORMALIZE ROWS

     Handles:
     { content: [...] }
     { rows: [...] }
     { items: [...] }
     [...]
  ======================================================= */

  const rows = useMemo(() => {
    if (Array.isArray(data?.content)) {
      return data.content;
    }

    if (Array.isArray(data?.rows)) {
      return data.rows;
    }

    if (Array.isArray(data?.items)) {
      return data.items;
    }

    if (Array.isArray(data)) {
      return data;
    }

    return [];
  }, [data]);

  /* =======================================================
     PAGE SIZE OPTIONS

     Prevents undefined.map()
  ======================================================= */

  const safePageSizeOptions = useMemo(() => {
    const source = Array.isArray(pageSizeOptions)
      ? pageSizeOptions
      : DEFAULT_PAGE_SIZE_OPTIONS;

    const normalized = source
      .map((value) => Number(value))
      .filter(
        (value) =>
          Number.isInteger(value) &&
          value > 0 &&
          value <= 100
      );

    if (normalized.length === 0) {
      return [...DEFAULT_PAGE_SIZE_OPTIONS];
    }

    return [...new Set(normalized)].sort(
      (a, b) => a - b
    );
  }, [pageSizeOptions]);

  /* =======================================================
     PAGINATION RESPONSE

     Supports several PageResponse naming conventions.
  ======================================================= */

  const totalElements = Math.max(
    0,
    toNumber(
      data?.totalElements ??
        data?.totalRecords ??
        data?.totalCount,
      rows.length
    )
  );

  const effectivePageSize = Math.max(
    1,
    toNumber(
      data?.size ??
        data?.pageSize ??
        pageSize,
      pageSize
    )
  );

  const calculatedPages =
    totalElements > 0
      ? Math.ceil(totalElements / effectivePageSize)
      : 0;

  const totalPages = Math.max(
    0,
    toNumber(
      data?.totalPages,
      calculatedPages
    )
  );

  const requestedPage = Math.max(
    0,
    toNumber(
      data?.page ??
        data?.pageNumber ??
        page,
      page
    )
  );

  const currentPage =
    totalPages > 0
      ? Math.min(
          requestedPage,
          totalPages - 1
        )
      : 0;

  const firstRecord =
    totalElements > 0
      ? currentPage * effectivePageSize + 1
      : 0;

  const lastRecord =
    totalElements > 0
      ? Math.min(
          firstRecord + rows.length - 1,
          totalElements
        )
      : 0;

  const canPrevious = currentPage > 0;

  const canNext =
    totalPages > 0 &&
    currentPage < totalPages - 1;

  const pageNumbers = useMemo(
    () =>
      buildPageNumbers(
        currentPage,
        totalPages,
        5
      ),
    [currentPage, totalPages]
  );

  /* =======================================================
     PAGE CHANGE
  ======================================================= */

  const changePage = (nextPage) => {
    const target = Number(nextPage);

    if (!Number.isInteger(target)) {
      return;
    }

    if (
      target < 0 ||
      target >= totalPages ||
      target === currentPage
    ) {
      return;
    }

    onPageChange(target);
  };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <>
      {/* TABLE */}

      <div className="preview-table-scroll">
        <table className="preview-growth-table">
          <thead>
            <tr>
              <th className="center">
                #
              </th>

              <th>
                GSTIN
              </th>

              <th>
                Return Period
              </th>

              <th className="num">
                Taxable Value
                <small>₹</small>
              </th>

              <th className="num">
                Output Tax
                <small>₹</small>
              </th>

              <th className="num">
                Eligible ITC
                <small>₹</small>
              </th>

              <th className="num">
                Utilized ITC
                <small>₹</small>
              </th>

              <th className="num">
                Cash Tax Paid
                <small>₹</small>
              </th>

              <th className="num">
                RCM Tax
                <small>₹</small>
              </th>

              <th className="num">
                MoM Growth
                <small>%</small>
              </th>

              <th className="num">
                YoY Growth
                <small>%</small>
              </th>

              <th className="center">
                Filing Delay
                <small>Days</small>
              </th>

              <th className="center">
                Growth Trend
              </th>
            </tr>
          </thead>

          <tbody>
            {/* LOADING */}

            {loading && (
              <tr>
                <td
                  colSpan={13}
                  className="table-state"
                >
                  Loading taxpayer growth data...
                </td>
              </tr>
            )}

            {/* EMPTY */}

            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={13}
                  className="table-state"
                >
                  No taxpayer growth records found.
                </td>
              </tr>
            )}

            {/* DATA */}

            {!loading &&
              rows.map((row, index) => {
                const gstin = String(
                  row?.gstin ?? ""
                )
                  .trim()
                  .toUpperCase();

                const isSelected =
                  Boolean(gstin) &&
                  gstin ===
                    String(
                      selectedGstin ?? ""
                    ).toUpperCase();

                const serialNumber =
                  currentPage *
                    effectivePageSize +
                  index +
                  1;

                return (
                  <tr
                    key={
                      row?.id ??
                      `${gstin}-${row?.retPeriod ?? "period"}-${index}`
                    }
                    className={
                      isSelected
                        ? "selected"
                        : ""
                    }
                    onClick={() => {
                      if (gstin) {
                        onSelectGstin(gstin);
                      }
                    }}
                  >
                    {/* SERIAL */}

                    <td className="center">
                      {serialNumber}
                    </td>

                    {/* GSTIN */}

                    <td>
                      {gstin ? (
                        <button
                          type="button"
                          className="gstin-table-link"
                          title={`View ${gstin} trend`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelectGstin(gstin);
                          }}
                        >
                          {gstin}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* PERIOD */}

                    <td>
                      {formatPeriod(
                        row?.retPeriod
                      )}
                    </td>

                    {/* TAXABLE VALUE */}

                    <td className="num">
                      {formatAmount(
                        row?.taxableValue
                      )}
                    </td>

                    {/* OUTPUT TAX */}

                    <td className="num">
                      {formatAmount(
                        row?.outputTax
                      )}
                    </td>

                    {/* ELIGIBLE ITC */}

                    <td className="num">
                      {formatAmount(
                        row?.eligibleItc
                      )}
                    </td>

                    {/* UTILIZED ITC */}

                    <td className="num">
                      {formatAmount(
                        row?.utilizedItc
                      )}
                    </td>

                    {/* CASH */}

                    <td className="num">
                      {formatAmount(
                        row?.cashTaxPaid
                      )}
                    </td>

                    {/* RCM */}

                    <td className="num">
                      {formatAmount(
                        row?.rcmTotalTax
                      )}
                    </td>

                    {/* MOM */}

                    <td
                      className={`num ${getGrowthClass(
                        row?.momTaxableGrowth
                      )}`}
                    >
                      {formatPercent(
                        row?.momTaxableGrowth
                      )}
                    </td>

                    {/* YOY */}

                    <td
                      className={`num ${getGrowthClass(
                        row?.yoyTaxableGrowth
                      )}`}
                    >
                      {formatPercent(
                        row?.yoyTaxableGrowth
                      )}
                    </td>

                    {/* FILING DELAY */}

                    <td className="center">
                      {row?.filingDelayDays ===
                        null ||
                      row?.filingDelayDays ===
                        undefined
                        ? "—"
                        : formatInteger(
                            row.filingDelayDays
                          )}
                    </td>

                    {/* TREND */}

                    <td className="center">
                      <span
                        className={`table-trend ${getTrendClass(
                          row?.growthTrend
                        )}`}
                      >
                        {formatTrend(
                          row?.growthTrend
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}

      <div className="preview-table-header">
        <div>
          <p>
            Showing{" "}
            <strong>
              {formatInteger(firstRecord)}
            </strong>
            {" - "}
            <strong>
              {formatInteger(lastRecord)}
            </strong>
            {" of "}
            <strong>
              {formatInteger(totalElements)}
            </strong>
            {" records"}
          </p>
        </div>

        <div className="table-controls">
          {/* PAGE SIZE */}

          <label>
            <span>Rows per page</span>

            <select
              value={effectivePageSize}
              onChange={(event) => {
                const nextSize = Number(
                  event.target.value
                );

                if (
                  Number.isInteger(nextSize) &&
                  nextSize > 0
                ) {
                  onPageSizeChange(nextSize);
                }
              }}
            >
              {safePageSizeOptions.map(
                (size) => (
                  <option
                    key={size}
                    value={size}
                  >
                    {size}
                  </option>
                )
              )}
            </select>
          </label>

          {/* PAGE BUTTONS */}

          <div
            className="table-pagination"
            aria-label="Table pagination"
          >
            <button
              type="button"
              title="First page"
              aria-label="First page"
              disabled={!canPrevious}
              onClick={() => changePage(0)}
            >
              <ChevronsLeft size={14} />
            </button>

            <button
              type="button"
              title="Previous page"
              aria-label="Previous page"
              disabled={!canPrevious}
              onClick={() =>
                changePage(currentPage - 1)
              }
            >
              <ChevronLeft size={14} />
            </button>

            {pageNumbers.map(
              (pageNumber) => (
                <button
                  type="button"
                  key={pageNumber}
                  className={
                    pageNumber === currentPage
                      ? "active"
                      : ""
                  }
                  aria-current={
                    pageNumber === currentPage
                      ? "page"
                      : undefined
                  }
                  onClick={() =>
                    changePage(pageNumber)
                  }
                >
                  {pageNumber + 1}
                </button>
              )
            )}

            <button
              type="button"
              title="Next page"
              aria-label="Next page"
              disabled={!canNext}
              onClick={() =>
                changePage(currentPage + 1)
              }
            >
              <ChevronRight size={14} />
            </button>

            <button
              type="button"
              title="Last page"
              aria-label="Last page"
              disabled={!canNext}
              onClick={() =>
                changePage(totalPages - 1)
              }
            >
              <ChevronsRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}