export class LayoutResolver {
  // Technical Profile is the CV's one layout, and what a link with no ?layout= opens (#231, #362). A retired or unknown
  // layout, ?layout=spotlight among them, opens it too: old links to the CV keep working.
  constructor(layouts = ['nerd', 'technical'], fallback = 'technical') {
    this.layouts = layouts;
    this.fallback = fallback;
  }

  resolve(search = '') {
    const requested = new URLSearchParams(search).get('layout');
    return this.layouts.includes(requested) ? requested : this.fallback;
  }
}
