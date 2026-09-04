export const MIN_SERIAL_BAUD_RATE = 1;
export const MAX_SERIAL_BAUD_RATE = 4_294_967_295;

export const SERIAL_BAUD_RATE_OPTIONS = [
  "9600",
  "19200",
  "38400",
  "57600",
  "74880",
  "115200",
  "230400",
  "250000",
  "460800",
  "921600",
];

export function normalizeSerialBaudRateInput(value: string): string {
  const maxDigits = String(MAX_SERIAL_BAUD_RATE).length;
  const digits = value.replace(/\D/g, "").slice(0, maxDigits);
  return digits.replace(/^0+(?=\d)/, "");
}

export function isValidSerialBaudRate(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;

  const parsed = Number(value);
  return (
    Number.isInteger(parsed) && parsed >= MIN_SERIAL_BAUD_RATE && parsed <= MAX_SERIAL_BAUD_RATE
  );
}
