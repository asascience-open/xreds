# Build the react frontend
FROM node:18-bullseye

# Create a folder for the app to live in
RUN mkdir -p /opt/viewer
WORKDIR /opt/viewer

COPY viewer/*.json viewer/*.config.cjs viewer/*.config.ts viewer/yarn.lock  ./ 

RUN yarn install

COPY viewer/index.html ./index.html
COPY viewer/public ./public
COPY viewer/src ./src

RUN npm run build

# Build the python service layer
FROM python:3.10-bullseye

# Native dependencies
RUN apt-get update
RUN apt-get install -y libudunits2-dev libgdal-dev libnetcdf-dev libeccodes-dev libgeos-dev

# Create a folder for the app to live in
RUN mkdir -p /opt/xreds
WORKDIR /opt/xreds

# Holder directory where react app lives in production
RUN mkdir build

# Copy over and install python dependencies
COPY requirements.txt ./requirements.txt
RUN python3 -m pip config set global.http.sslVerify false
RUN git config --global http.sslverify false
RUN pip3 install -r requirements.txt

# Copy over python app source code
COPY static ./static
COPY xreds ./xreds
COPY app.py ./app.py

# Copy the frontend build 
COPY --from=0 /opt/viewer/dist ./viewer/dist 

# Set the port to run the server on
ENV PORT 8090
ENV ROOT_PATH ""

# Run the webserver 
CMD ["sh", "-c", "gunicorn --workers=1 --worker-class=uvicorn.workers.UvicornWorker --log-level=debug --bind=0.0.0.0:${PORT} app:app"]
