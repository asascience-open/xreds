FROM python:3.10-buster

# Native dependencies
RUN apt-get update
RUN apt-get install -y libudunits2-dev libgdal20 libnetcdf-dev libeccodes-dev

# Create a folder for the app to live in
RUN mkdir -p /opt/zms
WORKDIR /opt/zms

# Holder directory where react app lives in production
RUN mkdir build

# Copy over and install python dependencies
COPY requirements.txt ./requirements.txt
RUN python3 -m pip config set global.http.sslVerify false
RUN git config --global http.sslverify false
RUN pip3 install -r requirements.txt

# Copy over python app source code 
COPY static ./static
COPY zms ./zms
COPY app.py ./app.py

# Set the port to run the server on
ENV PORT 8090
ENV ROOT_PATH ""

# Run the webserver 
CMD ["sh", "-c", "gunicorn --workers=1 --worker-class=uvicorn.workers.UvicornWorker --log-level=debug --bind=0.0.0.0:${PORT} app:app"]
