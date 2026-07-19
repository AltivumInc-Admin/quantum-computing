// The interactive page regions that sit OUTSIDE the mobile drawer. While the
// drawer is open it claims aria-modal, so sidebar.tsx marks every one of these
// inert. The ids are shared constants — imported both by the element owners
// (nav.tsx, footer.tsx, ask-tutor.tsx, the lesson page) and by the drawer — so
// renaming one is a single-file change the type system carries everywhere,
// instead of a silent getElementById(null) that voids the modal contract.
export const SITE_HEADER_ID = "site-header";
export const LESSON_CONTENT_ID = "lesson-content";
export const SITE_FOOTER_ID = "site-footer";
export const TUTOR_TRIGGER_ID = "ask-tutor-trigger";

/** Everything the open drawer must render inert to make aria-modal truthful. */
export const DRAWER_INERT_REGION_IDS = [
  SITE_HEADER_ID,
  LESSON_CONTENT_ID,
  SITE_FOOTER_ID,
  TUTOR_TRIGGER_ID,
] as const;
