/**
 * Converts Supabase authentication errors into clear, actionable guidance.
 */
export function getFriendlyErrorMessage(err: unknown): string {
  if (!err) {
    return "We couldn't complete the request. Please try again.";
  }

  const rawMessage =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message?: unknown }).message || "")
      : String(err);
  const message = rawMessage.toLowerCase();

  // Email confirmation must be handled separately from incorrect credentials.
  if (
    message.includes("email not confirmed") ||
    message.includes("email_not_confirmed") ||
    message.includes("confirm your email") ||
    message.includes("email confirmation")
  ) {
    return "Please verify your email using the latest confirmation link in your inbox or spam folder, then sign in again.";
  }

  if (
    message.includes("network") ||
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("connection") ||
    message.includes("offline") ||
    message.includes("timeout")
  ) {
    return "We couldn't connect to the authentication service. Check your internet connection and try again.";
  }

  if (
    message.includes("invalid grant") ||
    message.includes("invalid login") ||
    message.includes("invalid credentials") ||
    message.includes("credentials are invalid") ||
    message.includes("wrong password") ||
    message.includes("user not found") ||
    message.includes("no user found")
  ) {
    return "The email or password was not accepted. Check the email for spelling, try the password you originally registered with, or use Reset Password. If you just signed up, verify your email first.";
  }

  if (
    message.includes("invalid email") ||
    message.includes("unable to validate email") ||
    message.includes("email format")
  ) {
    return "Please enter a valid email address.";
  }

  if (
    message.includes("password should be") ||
    message.includes("password is too short") ||
    message.includes("password must be") ||
    message.includes("weak password")
  ) {
    return "Please choose a stronger password with at least 6 characters.";
  }

  if (
    message.includes("user already exists") ||
    message.includes("email already registered") ||
    message.includes("already registered") ||
    message.includes("already exists")
  ) {
    return "An account with this email may already exist. Sign in or use Reset Password instead of registering again.";
  }

  if (
    message.includes("session expired") ||
    message.includes("token expired") ||
    message.includes("jwt expired") ||
    message.includes("invalid token")
  ) {
    return "Your session has expired. Please sign in again to continue.";
  }

  return rawMessage && rawMessage.length < 180
    ? rawMessage
    : "Something went wrong. Please try again.";
}
