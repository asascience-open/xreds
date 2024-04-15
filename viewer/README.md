# xreds-viewer

The XREDS Viewer provides a web based interface for visualizing, accessing, and configuring the data managed by `xreds`. It is built with `reactjs` and `vitejs`.

## Running locally

Assuming `nodejs` is installed, install the dependencies with `npm`:

```bash
npm install
```

Then run (while `xreds` is running on the same machine):

```bash
npm run dev
```

## Building

To build to a static html app:

```bash
npm run build
```

The app will be compiled using `rollup` and placed in `./dist`.

## Deploying with `xreds`

The `xreds` Dockerfile builds this app and copies it to the production xreds image. See that file for more info.
