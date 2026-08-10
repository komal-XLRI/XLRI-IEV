/**
 * Stub for the `server-only` package, used by CLI scripts.
 *
 * The real package throws unless it is resolved under the `react-server`
 * condition, which plain Node does not set. Aliasing it in
 * `tsconfig.scripts.json` lets seed scripts reuse the service layer instead of
 * duplicating its logic against the models.
 */
export {};
