### Quickstart Guide

This plugin template uses **TypeScript** and **NPM**, two standard tools for creating JavaScript applications.

#### Prerequisites

1. **Download Node.js** (which includes NPM) from [nodejs.org](https://nodejs.org/en/download/).
2. **Install TypeScript** globally using the command:
  ```sh
  npm install -g typescript
  ```
3. **Install Plugin API Type Definitions** in your plugin directory:
  ```sh
  npm install --save-dev @figma/plugin-typings
  ```

#### Setup

1. **Clone the repository**.
2. **Install the dependencies**:
  ```sh
  npm install
  ```
3. **Build the plugin**:
  ```sh
  npm run watch
  ```
4. **Link the plugin in Figma**:
  1. Go to the `Plugins` section in Figma.
  2. Click on the `Development` tab.
  3. Click on the `Import Plugin from Manifest` button.
  4. Select the `manifest.json` file in the `frappe-builder` plugin directory.


For more detailed instructions, refer to the [Figma Plugin Quickstart Guide](https://www.figma.com/plugin-docs/plugin-quickstart-guide/).
