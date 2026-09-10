import multiprocessing
import os
import uvicorn

from app.main import app

if __name__ == "__main__":
    multiprocessing.freeze_support()
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=int(os.environ.get("JUPITER_PORT", "8000")),
        reload=False,
        workers=1
    )