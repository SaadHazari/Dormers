/** How many customers the list fetches per page (initial load and each
 *  "Load more"). Shared by the page and the load-more server action so the
 *  offset arithmetic can never drift between them. */
export const CUSTOMER_PAGE_SIZE = 200
