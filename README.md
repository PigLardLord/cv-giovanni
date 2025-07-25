# CV Giovanni Trovato

A modern, responsive CV/resume website built with vanilla JavaScript, featuring a clean architecture and professional design optimized for both web viewing and printing.

[![Demo](https://img.shields.io/badge/Demo-Live%20Site-blue)](https://piglardlord.github.io/cv-giovanni/)
[![Tests](https://img.shields.io/badge/Tests-Passing-green)](#testing)
[![Vanilla JS](https://img.shields.io/badge/Built%20with-Vanilla%20JS-yellow)](#technology-stack)

## ✨ Features

- **Responsive Design** - Optimized for desktop, tablet, and mobile viewing
- **Print-Optimized** - Dedicated 2-page PDF layout with recruiter-focused design
- **Data-Driven** - Easy content updates via JSON configuration
- **Modular Architecture** - Clean, maintainable code following SOLID principles
- **Zero Dependencies** - Pure vanilla JavaScript with no frameworks
- **Static Hosting Ready** - No build process required, works with any static host
- **Comprehensive Testing** - Full test suite with Jest and JSDOM

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ (for running tests)
- Modern web browser

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/PigLardLord/cv-giovanni.git
   cd cv-giovanni
   ```

2. **Install dependencies** (for testing only)
   ```bash
   npm install
   ```

3. **Open the CV**
   Simply open `index.html` in your browser - no build step required!

### Development

```bash
# Run tests
npm test

# Run specific test
npm test -- --testNamePattern="HeaderRenderer"

# Open CV in browser
open index.html
```

## 📁 Project Structure

```
cv-giovanni/
├── index.html              # Main HTML template
├── style.css              # Web styling and responsive design
├── print.css              # Dedicated print/PDF optimization
├── script.js              # Application entry point
├── cv-data.json           # CV content data
├── profile.png            # Profile image
├── CLAUDE.md              # AI assistant instructions
├── README.md              # This file
│
├── core/                  # Application core
│   ├── CVApplication.js   # Main application controller
│   ├── DataLoader.js      # JSON data loading utility
│   └── RendererContainer.js # Dependency injection container
│
├── interfaces/            # Type definitions
│   └── Renderer.js        # Base renderer interface
│
├── renderers/             # Modular rendering components
│   ├── BaseRenderer.js    # Shared utilities and patterns
│   ├── HeaderRenderer.js  # Header information
│   ├── ProfileRenderer.js # Professional summary
│   ├── ExperienceRenderer.js # Work experience
│   ├── EducationRenderer.js  # Education history
│   ├── SkillsRenderer.js     # Technical skills
│   ├── LanguagesRenderer.js  # Languages spoken
│   ├── CertificationsRenderer.js # Certifications
│   ├── SocialLinksRenderer.js    # Social media links
│   └── InterestsRenderer.js      # Personal interests
│
└── tests/                 # Test suite
    ├── jest.config.js     # Jest configuration
    ├── jest.setup.js      # Test environment setup
    └── *.test.js          # Individual test files
```

## 🏗️ Architecture

### Design Patterns

The project implements several software engineering best practices:

- **Model-View-Controller (MVC)** - Clear separation between data, presentation, and control logic
- **Dependency Injection** - Renderers are registered and managed through a container
- **Single Responsibility Principle** - Each renderer handles one CV section
- **Open/Closed Principle** - Easy to extend with new renderers without modifying existing code
- **Interface Segregation** - All renderers implement the same minimal interface
- **Dependency Inversion** - High-level modules don't depend on low-level modules

### Data Flow

```
cv-data.json → DataLoader → CVApplication → RendererContainer → Individual Renderers → DOM
```

1. **Data Loading** - `DataLoader` fetches CV data from JSON
2. **Application Initialization** - `CVApplication` orchestrates the rendering process
3. **Renderer Management** - `RendererContainer` manages and executes all renderers
4. **DOM Rendering** - Each renderer updates its specific section of the DOM

### Renderer Architecture

All renderers extend `BaseRenderer` which provides:

- **DOM Utilities** - Safe element selection and creation
- **Validation** - Data validation with graceful error handling
- **Common Patterns** - Shared code for lists, links, and content rendering

```javascript
// Example renderer implementation
export class ProfileRenderer extends BaseRenderer {
  render(root, data) {
    if (!this.validate(data)) return;
    
    const element = this.getElement(root, 'profile');
    if (element) {
      element.textContent = data.profile || '';
    }
  }
  
  validate(data) {
    return this.validateFields(data, ['profile']);
  }
}
```

## 📝 Content Management

### Updating CV Content

All CV content is stored in `cv-data.json`. To update:

1. **Edit the JSON file** with your information
2. **Refresh the browser** - changes are reflected immediately
3. **No build step required** - pure client-side rendering

### Data Structure

```json
{
  "name": "Your Name",
  "title": "Your Job Title",
  "location": "City, Country",
  "email": "your.email@example.com",
  "phone": "+1234567890",
  "profile": "Professional summary...",
  "relevant_experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "location": "City",
      "period": "Start - End",
      "description": "Job description..."
    }
  ],
  "education": [...],
  "skills": [...],
  "languages": [...],
  "certifications": [...],
  "interests": [...],
  "social": [...]
}
```

### Adding New Sections

To add a new CV section:

1. **Create a new renderer** extending `BaseRenderer`
2. **Register the renderer** in `script.js`
3. **Add corresponding HTML** in `index.html`
4. **Update the data structure** in `cv-data.json`
5. **Add tests** for the new renderer

## 🎨 Styling

### Design System

The CV uses a modern design system with:

- **CSS Custom Properties** - Consistent theming and easy customization
- **Inter Font Family** - Professional typography optimized for readability
- **Responsive Grid** - Flexible layout that adapts to different screen sizes
- **Print Optimization** - Special styles for high-quality PDF generation

### Key Design Features

- **Professional Color Palette** - Blue accent colors with neutral grays
- **Consistent Spacing** - Systematic spacing scale using CSS variables
- **Modern Typography** - Careful font sizing and line height for readability
- **Subtle Shadows** - Layered depth without being distracting
- **Responsive Images** - Profile photo optimization for all devices

### Print/PDF Optimization

The CV includes a dedicated `print.css` stylesheet optimized for recruiter needs:

- **2-Page Maximum** - Carefully designed to fit in exactly 2 pages
- **A4 Format** - Standard business document size with proper margins
- **Recruiter-Friendly Layout** - Key information prominently positioned
- **Clean Typography** - Professional fonts and spacing for readability
- **Smart Page Breaks** - Content sections flow logically across pages
- **Print Color Management** - Optimized for both color and black & white printing

## 🧪 Testing

### Test Suite

Comprehensive testing with Jest and JSDOM:

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test HeaderRenderer.test.js

# Run tests in watch mode
npm test -- --watch
```

### Test Structure

- **Unit Tests** - Individual renderer functionality
- **Integration Tests** - Application flow and data loading
- **DOM Tests** - Actual DOM manipulation verification
- **Error Handling** - Graceful failure scenarios

### Testing Philosophy

- **High Coverage** - All critical paths tested
- **Real DOM Testing** - Tests use JSDOM for authentic DOM manipulation
- **Error Scenarios** - Tests handle missing data and edge cases
- **Maintainable Tests** - Clear, readable test descriptions

## 🚀 Deployment

### Static Hosting

This CV works with any static hosting service:

- **GitHub Pages** - Current deployment at `https://piglardlord.github.io/cv-giovanni/`
- **Netlify** - Drag and drop deployment
- **Vercel** - Git-based deployment
- **AWS S3** - Cloud storage hosting
- **Any Web Server** - Apache, Nginx, etc.

### Build Process

**No build process required!** Simply upload these files:

- `index.html`
- `style.css`
- `print.css`
- `script.js`
- `cv-data.json`
- `profile.png`
- `core/` directory
- `interfaces/` directory
- `renderers/` directory

## 🤝 Contributing

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Make your changes**
4. **Run tests** (`npm test`)
5. **Commit your changes** (`git commit -m 'Add amazing feature'`)
6. **Push to the branch** (`git push origin feature/amazing-feature`)
7. **Open a Pull Request**

### Code Standards

- **ES6+ JavaScript** - Modern JavaScript features
- **Class-based Architecture** - Object-oriented design patterns
- **Comprehensive Testing** - All new features must include tests
- **Documentation** - Update README and inline comments
- **SOLID Principles** - Follow established architecture patterns

### Adding New Features

When adding new functionality:

1. **Follow existing patterns** - Use `BaseRenderer` for new renderers
2. **Write tests first** - TDD approach preferred
3. **Update documentation** - Keep README current
4. **Maintain backwards compatibility** - Don't break existing APIs

## 📄 License

This project is open source and available under the [ISC License](LICENSE).

## 🔗 Links

- **Live Demo**: [https://piglardlord.github.io/cv-giovanni/](https://piglardlord.github.io/cv-giovanni/)
- **GitHub Repository**: [https://github.com/PigLardLord/cv-giovanni](https://github.com/PigLardLord/cv-giovanni)
- **Portfolio**: [https://sites.google.com/view/giovanni-trovato](https://sites.google.com/view/giovanni-trovato)

## 👨‍💻 About the Developer

Giovanni Trovato is an iOS Developer with over 7 years of experience in mobile application development, specializing in Swift, SwiftUI, and modern iOS architectures.

---

*Built with ❤️ using vanilla JavaScript and modern web standards*