from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# In-memory database for todos
todos_db = []
next_id = 1


class Todo(BaseModel):
    id: int
    title: str
    completed: bool


class CreateTodo(BaseModel):
    title: str
    completed: Optional[bool] = False


# 新增 CORS 中间件配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有 HTTP 方法
    allow_headers=["*"],  # 允许所有 HTTP 头
)

# Example initial data
if not todos_db:
    todos_db.append(Todo(id=next_id, title="Learn FastAPI", completed=False))
    next_id += 1
    todos_db.append(Todo(id=next_id, title="Build an API tester", completed=True))
    next_id += 1


@app.get("/todos", response_model=List[Todo])
async def get_todos():
    return todos_db


@app.get("/todos/{todo_id}", response_model=Todo)
async def get_todo(todo_id: int):
    for todo in todos_db:
        if todo.id == todo_id:
            return todo
    raise HTTPException(status_code=404, detail="Todo not found")


@app.post("/todos", response_model=Todo, status_code=201)
async def create_todo(todo_create: CreateTodo):
    global next_id
    new_todo = Todo(
        id=next_id, title=todo_create.title, completed=todo_create.completed or False
    )
    todos_db.append(new_todo)
    next_id += 1
    return new_todo


# Example initial data (optional)
if not todos_db:
    todos_db.append(Todo(id=next_id, title="Learn FastAPI", completed=False))
    next_id += 1
    todos_db.append(Todo(id=next_id, title="Build an API tester", completed=True))
    next_id += 1


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
