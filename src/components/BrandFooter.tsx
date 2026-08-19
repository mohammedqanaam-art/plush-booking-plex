type BrandFooterProps = {
  className?: string;
};

const BrandFooter = ({ className = "" }: BrandFooterProps) => (
  <footer className={`brand-footer ${className}`.trim()}>
    <div className="brand-footer__inner">
      <div className="brand-footer__logo" aria-label="مجموعة بودل للضيافة">
        <img src="/bhg-hospitality-group.jpg" alt="مجموعة بودل للضيافة" />
      </div>
      <div className="brand-footer__copy">
        <strong>إدارة الحجز المركزي</strong>
        <span>BHG · BOUDL HOSPITALITY GROUP · EST. 1959</span>
      </div>
    </div>
  </footer>
);

export default BrandFooter;
