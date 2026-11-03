/**
 * Full-screen loader shown on a full page load. Pure CSS (see
 * .app-preloader in app/globals.css): the wordmark rises in, the bar fills,
 * then the overlay fades out by itself, so it never blocks the app and needs
 * no script. Client-side navigations keep the root layout, so it does not
 * replay.
 */
export default function AppPreloader() {
  return (
    <div className="app-preloader print:hidden" role="status" aria-label="Loading AyurStock Pro">
      <div className="app-preloader__inner">
        <div className="app-preloader__wordmark" aria-hidden="true">
          <span className="app-preloader__ayur">Ayur</span>Stock
          <span className="app-preloader__pro">Pro</span>
        </div>
        <div className="app-preloader__bar" aria-hidden="true">
          <div className="app-preloader__fill" />
        </div>
      </div>
    </div>
  );
}
