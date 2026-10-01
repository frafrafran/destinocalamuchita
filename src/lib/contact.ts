/** wa.me link from any human-typed phone number ("+54 9 3546 52-3664" → https://wa.me/5493546523664). */
export function whatsappUrl(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
