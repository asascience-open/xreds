# xreds-viewer

The XREDS Viewer provides a web based interface for visualizing, accessing, and configuring the data managed by `xreds`. It is built with `reactjs` and `vitejs`.

## Running locally 

Assuming `nodejs`, `npm`, nad `yarn` are installed, install the dependencies with `yarn`: 

```bash
yarn install 
```

Then run (while `xreds` is running on the same machine): 

```
yarn dev
```

## Building

To build to a static html app: 

```bash
yarn build
```

The app will be compiled using `rollup` and placed in `./dist`. 

## Deploying with `xreds`

The `xreds` Dockerfile builds this app and copies it to the production xreds image. See that file for more info. 