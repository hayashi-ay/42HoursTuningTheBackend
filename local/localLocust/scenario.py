import logging
import json
import threading
from locust import HttpUser, between, task, constant
import random

# 雑に認証を回避
def genHeaders(userId):
    return {'content-type': 'application/json',
            'x-app-key': 'dol')}

def genDetail():
    return "お世話になっております。\n 負荷試験のため、データを登録させていただきます。\n\nよろしくお願いいたします。"

def getAccessUserId():
    return random.randint(1, 100000)

newFileId = []
newRecordId = []
newItemInfo = []
newItemForThumbInfo = []

nowUserNum = 0

class WebAppTestTasks(HttpUser):
    wait_time = constant(0.9)
    def __init__(self, parent):
        global nowUserNum
        logging.debug("nowUserNum: " + str(nowUserNum))
        self.myId= -1
        self.targetId = 6
        tlock = threading.Lock()
        with tlock:
            try:
                self.myId = nowUserNum
                self.targetId = nowUserNum % 13
                nowUserNum = nowUserNum + 1
            except Exception as e:
                logging.debug("DAERROR: initでエラーが起きました。")
                logging.debug(e)

        logging.debug("targetId: " + str(self.targetId))
        super().__init__(parent)

    @task
    def index(self):
        self.getCategories()

    def getCategories(self):
        recordId = getRecordId()
        userId = getAccessUserId()
        self.client.get(url= "/api/client/categories/",
                        headers= genHeaders(userId), name="/categories", timeout=50)
