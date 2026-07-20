/**
 * The same-origin URL prefix the Monaco AMD loader boots from — VERSION-STAMPED.
 *
 * Why the version is in the path: `/monaco/**` is served
 * `public, max-age=31536000, immutable` (customHttp.yml). That grant is only
 * honest if EVERY URL under it changes when the contents change. Monaco's own
 * entry points do not: `vs/loader.js`, `vs/editor/editor.main.js` and
 * `vs/basic-languages/monaco.contribution.js` are stable, unhashed filenames
 * whose bodies hard-reference content-HASHED siblings (`../editor.api-<hash>`,
 * `../workers-<hash>`, ~120 language chunks). On a monaco-editor upgrade the
 * hashed chunk names all change while the entry filenames do not, so a returning
 * learner holding a year-long immutable entry file would request chunk URLs the
 * new deploy no longer serves — and `loader.config` pins exactly one origin with
 * no CDN fallback, so the AMD load fails, `onMount` never fires, the load
 * watchdog trips, and every runnable cell renders "Couldn't load the editor."
 * `immutable` also tells the browser to skip revalidation, so the component's
 * own "Reload page" affordance cannot recover it — only a hard reload can.
 *
 * Stamping the version into the directory makes every URL in the tree change on
 * a bump, so `immutable` is correct by construction.
 *
 * MONACO_VERSION must equal the installed `monaco-editor` version:
 * scripts/stage-monaco.mjs stages into `public/monaco/<installed version>/vs`
 * and FAILS THE BUILD if this constant disagrees, so an upgrade can never
 * silently point the loader at a directory that was never staged.
 */
export const MONACO_VERSION = "0.55.1";

/** What `loader.config({ paths: { vs } })` is pointed at. */
export const MONACO_VS_PATH = `/monaco/${MONACO_VERSION}/vs`;
