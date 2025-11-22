# Workout Machine App

A web-based application for controlling and monitoring the Vitruvian Trainer+ workout platform. This application provides an interface for managing workout sessions and device communications from an Android device to the Vitruvian via BLE.

## Features

- Device connectivity and control via BLE
- Real-time workout monitoring
- Chart visualization for workout data
- Multiple workout modes support
- Protocol handling for device communication

## Getting Started

### Prerequisites

- Modern web browser such as Chrome 
    - JavaScript enabled
    - Bluetooth access enabled
- Compatible Vitruvian Trainer+

### Installation

1. Clone the repository:
```bash
git clone https://github.com/andokalled-spec/workoutmachineappfree.git
```

2. Open `index.html` in your web browser

#### Hot Reload

For faster development cycles, Vite (a modern build tool - https://vite.dev/) allows for hot module reloads.

After cloning the repo, use your favorite package manager to install Vite. The launch Vite
```bash
$ npm install vite --save-dev
$ npm run dev
> dev
> vite

  VITE v6.4.1  ready in 246 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

Launch the displayed local url in a browser and as you save code changes the browser will reflect the changes immediately.


## Usage

The application provides an interface to:
- Connect to your Vitruvian Trainer+ 
- Select workout modes
- Monitor your workout progress
- View performance charts

## File Structure

- `app.js` - Main application logic
- `chart.js` - Data visualization components
- `device.js` - Device connection and communication
- `modes.js` - Workout mode implementations
- `protocol.js` - Communication protocol handlers
- `index.html` - Main application interface

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License

Copyright (c) 2025 andokalled-spec

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.