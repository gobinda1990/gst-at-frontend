const StatsCard = ({
  icon,
  title,
  value,
  subtitle,
  color,
}) => {
  return (
    <div className="card stats-card shadow-sm border-0">
      <div className="card-body d-flex align-items-center">

        <div
          className="stats-icon"
          style={{ background: color }}
        >
          {icon}
        </div>

        <div className="ms-3">
          <h6>{title}</h6>

          <h2
            style={{
              color: color,
              fontWeight: "700",
            }}
          >
            {value}
          </h2>

          <small>{subtitle}</small>
        </div>
      </div>
    </div>
  );
};

export default StatsCard;