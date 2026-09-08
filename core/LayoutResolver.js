export class LayoutResolver {
  constructor(layouts = ['classic', 'spotlight', 'technical'], fallback = 'spotlight') {
    this.layouts = layouts;
    this.fallback = fallback;
  }

  resolve(search = '') {
    const requested = new URLSearchParams(search).get('layout');
    return this.layouts.includes(requested) ? requested : this.fallback;
  }
}
