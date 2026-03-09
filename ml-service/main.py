from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"status": "ML Service is running", "model": "Ready to load"}