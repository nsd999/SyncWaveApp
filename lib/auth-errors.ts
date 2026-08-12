/**
 * Standardizes authentication error messages to provide clean, friendly, and 
 * actionable feedback to users.
 */
export function getFriendlyErrorMessage(err: any): string {
  if (!err) {
    return "Our Servers just F**ked up!. Please try again later.";
  }
  
  const message = (err.message || String(err)).toLowerCase();

  // Network or connectivity issues
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to fetch') ||
    message.includes('connection') ||
    message.includes('offline') ||
    message.includes('timeout')
  ) {
    return "We couldn't connect right now. Check your internet and try again.";
  }

  // Invalid login credentials, wrong password, user not found
  if (
    message.includes('invalid grant') ||
    message.includes('invalid login') ||
    message.includes('credentials') ||
    message.includes('wrong password') ||
    message.includes('user not found') ||
    message.includes('no user found')
  ) {
    return "That email or password doesn't match. Try again.";
  }

  // Email format validation
  if (
    message.includes('invalid email') ||
    message.includes('unable to validate email') ||
    message.includes('email format')
  ) {
    return "Please enter a valid email address.";
  }

  // Password strength / policy constraints
  if (
    message.includes('password should be') ||
    message.includes('password is too short') ||
    message.includes('password must be')
  ) {
    return "Your password should be at least 6 characters long.";
  }

  // Duplicate email account sign up
  if (
    message.includes('user already exists') ||
    message.includes('email already registered') ||
    message.includes('already registered') ||
    message.includes('already exists')
  ) {
    return "An account with this email address already exists. Try signing in instead.";
  }

  // Session expiry or token failure
  if (
    message.includes('session expired') ||
    message.includes('token expired') ||
    message.includes('jwt expired') ||
    message.includes('invalid token')
  ) {
    return "Your session has expired. Please sign in again to continue.";
  }

  // Default fallback for any other unhandled errors
  return "Something went wrong. Please try again.";
}
