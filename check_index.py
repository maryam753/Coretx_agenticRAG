import chromadb, json, pathlib, datetime

base = pathlib.Path("backend/data")
mp = base / "manifest.json"
m = json.loads(mp.read_text())

saved = datetime.datetime.fromtimestamp(mp.stat().st_mtime)
print("manifest saved at:   ", saved.strftime("%H:%M:%S"))
print("chunks the manifest expects:", m["stats"]["chunks"])

client = chromadb.PersistentClient(path=str(base / "chroma"))
for c in client.list_collections():
    name = c if isinstance(c, str) else c.name
    print("collection:", name, "-> vectors:", client.get_collection(name).count())