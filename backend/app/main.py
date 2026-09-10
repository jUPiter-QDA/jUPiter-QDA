from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.routers import audio, codes, documents, folders, memos, projects, segments

Base.metadata.create_all(bind=engine)

app = FastAPI(title="jUPiter QDA API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "SQLAlchemy Backend is running with Clean Architecture!"}

app.include_router(projects.router)
app.include_router(documents.router)
app.include_router(codes.router)
app.include_router(segments.router)
app.include_router(folders.router)
app.include_router(memos.router)
app.include_router(audio.router)

if __name__ == "__main__":
    import os
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("JUPITER_PORT", "8000")))
