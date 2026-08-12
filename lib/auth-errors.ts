/**
 * Standardizes authentication error messages to provide clean, friendly, and 
 * actionable feedback to users.
 */
export function getFriendlyErrorMessage(err: any): string {
  if (!err) {
    return "Our Servers just F**ked up!. Please try again later.";
  }
  
  const rawMessage = err.message || String(err);
  const message = rawMessage.toLowerCase();

  // Return the raw message in brackets for debugging
  return `Error: ${rawMessage}`;
}
