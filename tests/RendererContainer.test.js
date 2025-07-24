import { RendererContainer } from '../core/RendererContainer.js';
import { Renderer } from '../interfaces/Renderer.js';

class MockRenderer extends Renderer {
  constructor(name) {
    super();
    this.name = name;
    this.rendered = false;
  }

  render(root, data) {
    this.rendered = true;
    this.lastData = data;
  }
}

describe('RendererContainer', () => {
  let container;

  beforeEach(() => {
    container = new RendererContainer();
  });

  test('registers and retrieves renderers', () => {
    const mockRenderer = new MockRenderer('test');
    
    container.register('header', mockRenderer);
    
    expect(container.get('header')).toBe(mockRenderer);
    expect(container.getRendererNames()).toContain('header');
  });

  test('throws error for unknown renderer', () => {
    expect(() => {
      container.get('unknown');
    }).toThrow("Renderer 'unknown' not found");
  });

  test('renders all registered renderers', () => {
    const renderer1 = new MockRenderer('renderer1');
    const renderer2 = new MockRenderer('renderer2');
    
    container.register('r1', renderer1);
    container.register('r2', renderer2);
    
    const mockRoot = {};
    const mockData = { test: true };
    
    container.renderAll(mockRoot, mockData);
    
    expect(renderer1.rendered).toBe(true);
    expect(renderer2.rendered).toBe(true);
    expect(renderer1.lastData).toBe(mockData);
  });

  test('handles renderer errors gracefully', () => {
    const errorRenderer = new MockRenderer('error');
    errorRenderer.render = () => { throw new Error('Test error'); };
    
    container.register('error', errorRenderer);
    
    // Should not throw, but log error
    expect(() => {
      container.renderAll({}, {});
    }).not.toThrow();
  });
});