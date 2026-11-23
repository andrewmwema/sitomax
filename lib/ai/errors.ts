/** An error whose message is written for the person using the editor and is safe to show them. */
export class AiUserError extends Error {
  override name = "AiUserError";
}
