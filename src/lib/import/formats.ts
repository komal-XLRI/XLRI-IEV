/**
 * What an import will accept.
 *
 * Kept free of `server-only` because the file picker needs it too, and the
 * picker and the reader disagreeing is how a file gets chosen and then
 * rejected — the worst possible order for that conversation.
 */

/** The `accept` attribute for the file input. */
export const IMPORT_ACCEPT = '.csv,.tsv,.txt,.xlsx,.xls';

/** Said on screen, so nobody has to open the picker to find out. */
export const IMPORT_FORMAT_LABEL = 'Excel (.xlsx), CSV, or tab-separated';
