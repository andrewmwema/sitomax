export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly reason?: "inactive-recipient",
    readonly providerCode?: number,
    readonly providerStatus?: number,
    readonly providerMessage?: string,
  ) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}
