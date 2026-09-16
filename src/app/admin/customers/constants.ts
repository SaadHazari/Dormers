/** How many customers the list fetches per page (initial load and each
 *  "Load more"). Shared by the page and the load-more server action so the
 *  offset arithmetic can never drift between them. */
export const CUSTOMER_PAGE_SIZE = 200

/**
 * How many people one deletion batch may cover.
 *
 * The cap exists so the confirmation stays a decision rather than a formality —
 * a list of 400 names is not something anyone reads. It lives here rather than
 * in the server action because the list needs it too: the button is disabled
 * and says why BEFORE the click, instead of the server refusing afterwards with
 * a message that renders off-screen.
 */
export const MAX_DELETE_BATCH = 100
