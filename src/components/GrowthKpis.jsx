import React from "react";

import {
  ArrowDownRight,
  ArrowUpRight,
  Equal,
  Users,
} from "lucide-react";

const fmt = (value) =>
  Number(value || 0).toLocaleString(
    "en-IN"
  );

const share = (
  value,
  total
) => {
  const a = Number(value || 0);
  const b = Number(total || 0);

  if (!b) {
    return "0.0";
  }

  return (
    (a / b) *
    100
  ).toFixed(1);
};

export default function GrowthKpis({
  summary,
  loading,
}) {
  const total =
    summary?.totalTaxpayers || 0;

  const cards = [
    {
      title: "Total Taxpayers",
      value: total,
      note:
        "Taxpayers in selected period",
      type: "blue",
      icon: <Users size={22} />,
    },
    {
      title: "Growing Taxpayers",
      value:
        summary?.growingTaxpayers,
      note: `${share(
        summary?.growingTaxpayers,
        total
      )}% of total`,
      type: "green",
      icon: (
        <ArrowUpRight size={23} />
      ),
    },
    {
      title: "Declining Taxpayers",
      value:
        summary?.decliningTaxpayers,
      note: `${share(
        summary?.decliningTaxpayers,
        total
      )}% of total`,
      type: "red",
      icon: (
        <ArrowDownRight size={23} />
      ),
    },
    {
      title: "Stable Taxpayers",
      value:
        summary?.stableTaxpayers,
      note: `${share(
        summary?.stableTaxpayers,
        total
      )}% of total`,
      type: "purple",
      icon: <Equal size={23} />,
    },
  ];

  return (
    <section className="preview-kpi-grid">

      {cards.map((card) => (
        <article
          className={`preview-kpi ${card.type}`}
          key={card.title}
        >

          <div className="preview-kpi-icon">
            {card.icon}
          </div>

          <div className="preview-kpi-content">

            <span className="preview-kpi-title">
              {card.title}
            </span>

            <strong>
              {loading
                ? "..."
                : fmt(card.value)}
            </strong>

            <small>
              {card.note}
            </small>

          </div>

        </article>
      ))}

    </section>
  );
}