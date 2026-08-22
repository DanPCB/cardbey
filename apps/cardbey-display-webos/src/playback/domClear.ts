/**
 * Chrome 68 / webOS does not support Element.replaceChildren (Chrome 86+).
 */
export function clearElementChildren(el: Element): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}
