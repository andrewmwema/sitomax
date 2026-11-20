export class EmailDeliveryError extends Error {
  constructor(message: string, readonly reason?: "inactive-recipient") {
    super(message);
    this.name = "EmailDeliveryError";
  }
}
