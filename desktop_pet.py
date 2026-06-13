

import os
import sys
import time
import threading
import tkinter as tk
import random
from collections import deque
from PIL import Image, ImageTk, ImageOps

try:
    from huggingface_hub import hf_hub_download
    from llama_cpp import Llama
except Exception:
    hf_hub_download = None
    Llama = None

PET_SIZE = 110           # Zielgröße des Pets in Pixeln (Sprites sind 128x128)
TASKBAR_OFFSET = 40
TRANSPARENT = (255, 0, 255)  # Magenta - wird im Fenster unsichtbar

TICK_MS = 15             # Update-Intervall (kleiner = flüssiger)
ANIM_EVERY = 8           # Walk-Sprite wechselt alle N Ticks
WALK_SPEED = 0.25        # Pixel pro Tick beim Laufen
FALL_GRAVITY = 0.75      # Beschleunigung beim Fallen (Pixel/Tick^2)
FALL_MAX_SPEED = 11      # maximale Fallgeschwindigkeit (Pixel/Tick)

THROW_MIN_SPEED = 1.5    # ab dieser Geschwindigkeit (Pixel/Tick) gilt es als Wurf
THROW_MAX_SPEED = 20     # Obergrenze für die Wurfgeschwindigkeit
WALL_BOUNCE_DAMPING = 0.5    # Energieverlust beim Abprallen von Bildschirmrändern
GROUND_BOUNCE_DAMPING = 0.45 # Energieverlust beim Aufprall auf dem Boden
GROUND_BOUNCE_MIN = 0.75     # unterhalb dieser Geschwindigkeit wird nicht mehr abgeprallt

def resource_path(relative):
    """Pfad zu Daten-Dateien - funktioniert sowohl direkt mit Python
    als auch in einer mit PyInstaller gebauten App."""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, relative)


SPRITE_DIR = resource_path("sprites")

# Sprite-Zuordnung (aus Shimeji-ee actions.xml übernommen)
WALK_CYCLE = ["shime1.png", "shime2.png", "shime1.png", "shime3.png"]
STAND = "shime1.png"
SIT = "shime11.png"
SIT_LOOK_UP = "shime26.png"
FALL = "shime4.png"
CHEER = "shime46.png"
DRAG_CYCLE = ["shime5.png", "shime6.png", "shime7.png", "shime8.png", "shime9.png", "shime10.png"]
DRAG_WIGGLE_THRESHOLD = 0.75  # Bewegung pro Tick (Pixel), ab der die Struggle-Animation startet

# ------------------------------------------------------------
# Lokale KI (llama-cpp-python, Qwen2.5-1.5B-Instruct)
# ------------------------------------------------------------
MODEL_REPO = "bartowski/Qwen2.5-1.5B-Instruct-GGUF"
MODEL_FILE = "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf"  # ~1 GB, wird beim ersten Start geladen

CHILDE_SYSTEM_PROMPT = (
    "Du bist Childe (Tartaglia) aus Genshin Impact, als kleines Desktop-Pet. "
    "Antworte extrem kurz: maximal 1 Satz, idealerweise nur wenige Worte. "
    "Selbstbewusst, kampfeslustig, aber herzlich und freundschaftlich. "
    "Antworte auf Deutsch."
)

_llm = None
_llm_lock = threading.Lock()


def get_llm():
    """Lädt das lokale Modell beim ersten Aufruf (kann etwas dauern)."""
    global _llm
    if Llama is None:
        raise RuntimeError(
            "llama-cpp-python/huggingface_hub sind nicht installiert "
            "(siehe requirements.txt)."
        )
    with _llm_lock:
        if _llm is None:
            model_path = hf_hub_download(repo_id=MODEL_REPO, filename=MODEL_FILE)
            _llm = Llama(model_path=model_path, n_ctx=2048, verbose=False)
    return _llm


def ask_childe(prompt):
    llm = get_llm()
    output = llm.create_chat_completion(
        messages=[
            {"role": "system", "content": CHILDE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        max_tokens=40,
        repeat_penalty=1.3,
        temperature=0.7,
    )
    return output["choices"][0]["message"]["content"].strip() or "..."


class DesktopPet:
    def __init__(self):
        self.root = tk.Tk()
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)

        if sys.platform == "darwin":
            # macOS: die spezielle Farbe "systemTransparent" wird
            # zusammen mit "-transparent" unsichtbar.
            bg_color = "systemTransparent"
            self.root.config(bg=bg_color)
            self.root.attributes("-transparent", True)
        else:
            # Windows: diese eine Farbe wird per "-transparentcolor" unsichtbar.
            bg_color = "#%02x%02x%02x" % TRANSPARENT
            self.root.config(bg=bg_color)
            self.root.attributes("-transparentcolor", bg_color)

        # Canvas statt Label: native Aqua-Widgets (z.B. Label) ignorieren auf
        # macOS oft die bg-Farbe, Canvas respektiert sie zuverlässig.
        self.canvas = tk.Canvas(
            self.root,
            width=PET_SIZE,
            height=PET_SIZE,
            bg=bg_color,
            highlightthickness=0,
            bd=0,
        )
        self.canvas.pack()
        self.sprite_item = self.canvas.create_image(0, 0, anchor="nw")

        self.sprites = self.load_sprites()

        self.screen_w = self.root.winfo_screenwidth()
        self.screen_h = self.root.winfo_screenheight()

        self.x = random.randint(0, self.screen_w - PET_SIZE)
        self.ground_y = self.screen_h - PET_SIZE - TASKBAR_OFFSET
        self.y = self.ground_y

        self.direction = random.choice([-1, 1])
        self.speed = WALK_SPEED

        self.state = "walk"       # walk, idle, sit, fall, drag, cheer, thrown
        self.state_timer = 0
        self.walk_frame = 0
        self.anim_tick = 0
        self.fall_speed = 0
        self.vx = 0.0
        self.vy = 0.0
        self.drag_history = deque(maxlen=5)

        self.chat_win = None
        self.bubble_win = None
        self.bubble_after_id = None

        self.root.geometry(f"{PET_SIZE}x{PET_SIZE}+{self.x}+{int(self.y)}")

        self.was_dragged = False
        self.canvas.bind("<Button-1>", self.on_mouse_down)
        self.canvas.bind("<B1-Motion>", self.on_mouse_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_mouse_up)
        self.canvas.bind("<Button-3>", self.on_right_click)

        self.update()
        self.root.mainloop()

    # ------------------------------------------------------------
    # Sprites laden
    # ------------------------------------------------------------
    def load_sprites(self):
        names = set(WALK_CYCLE) | set(DRAG_CYCLE) | {STAND, SIT, SIT_LOOK_UP, FALL, CHEER}
        sprites = {}
        for name in names:
            path = os.path.join(SPRITE_DIR, name)
            img = Image.open(path).convert("RGBA")
            img = img.resize((PET_SIZE, PET_SIZE), Image.LANCZOS)

            # Alpha hart auf an/aus setzen, damit keine halbtransparenten
            # Kantenpixel mit dem Hintergrund verschwimmen (rosa Rand).
            r, g, b, alpha = img.split()
            alpha = alpha.point(lambda a: 255 if a > 128 else 0)
            img = Image.merge("RGBA", (r, g, b, alpha))

            if sys.platform == "darwin":
                # macOS: echte Transparenz behalten, Label-Hintergrund
                # "systemTransparent" sorgt für den Durchblick.
                final = img
            else:
                # Windows: Transparenz -> Magenta-Hintergrund (für -transparentcolor)
                bg = Image.new("RGBA", img.size, TRANSPARENT + (255,))
                bg.paste(img, (0, 0), img)
                final = bg.convert("RGB")

            normal = ImageTk.PhotoImage(final)
            mirrored = ImageTk.PhotoImage(ImageOps.mirror(final))
            sprites[name] = {-1: normal, 1: mirrored}
        return sprites

    def set_sprite(self, name):
        img = self.sprites[name][self.direction]
        self.canvas.itemconfig(self.sprite_item, image=img)
        self.current_image = img  # Referenz behalten

    # ------------------------------------------------------------
    # Verhalten / Update-Schleife
    # ------------------------------------------------------------
    def update(self):
        if self.state == "drag":
            movement = abs(self.x - self.prev_x) + abs(self.y - self.prev_y)
            if movement > DRAG_WIGGLE_THRESHOLD:
                if self.anim_tick % ANIM_EVERY == 0:
                    self.walk_frame = (self.walk_frame + 1) % len(DRAG_CYCLE)
                self.set_sprite(DRAG_CYCLE[self.walk_frame])
            else:
                self.walk_frame = 0
                self.set_sprite(STAND)
            self.prev_x, self.prev_y = self.x, self.y

        elif self.state == "fall":
            self.fall_speed = min(self.fall_speed + FALL_GRAVITY, FALL_MAX_SPEED)
            self.y += self.fall_speed
            self.set_sprite(FALL)
            if self.y >= self.ground_y:
                self.y = self.ground_y
                self.fall_speed = 0
                self.state = "walk"
                self.state_timer = 0

        elif self.state == "thrown":
            self.vy = min(self.vy + FALL_GRAVITY, FALL_MAX_SPEED)
            self.x += self.vx
            self.y += self.vy

            # Abprallen an den Bildschirmrändern
            if self.x <= 0:
                self.x = 0
                self.vx = -self.vx * WALL_BOUNCE_DAMPING
                self.direction = 1
            elif self.x >= self.screen_w - PET_SIZE:
                self.x = self.screen_w - PET_SIZE
                self.vx = -self.vx * WALL_BOUNCE_DAMPING
                self.direction = -1
            elif abs(self.vx) > 0.1:
                self.direction = 1 if self.vx > 0 else -1

            self.set_sprite(FALL)

            # Aufprall auf dem Boden
            if self.y >= self.ground_y:
                self.y = self.ground_y
                if self.vy > GROUND_BOUNCE_MIN:
                    self.vy = -self.vy * GROUND_BOUNCE_DAMPING
                    self.vx *= 0.7
                else:
                    self.vx = 0.0
                    self.vy = 0.0
                    self.state = "walk"
                    self.state_timer = 0

        elif self.state == "cheer":
            self.set_sprite(CHEER)
            self.state_timer += 1
            if self.state_timer > 12 * ANIM_EVERY:  # ~1.5s
                self.state = "idle"
                self.state_timer = 0

        elif self.state == "walk":
            self.x += self.speed * self.direction

            if self.x <= 0:
                self.x = 0
                self.direction = 1
            elif self.x >= self.screen_w - PET_SIZE:
                self.x = self.screen_w - PET_SIZE
                self.direction = -1

            if self.anim_tick % ANIM_EVERY == 0:
                self.walk_frame = (self.walk_frame + 1) % len(WALK_CYCLE)
            self.set_sprite(WALK_CYCLE[self.walk_frame])

            self.state_timer += 1
            if self.state_timer > random.randint(60, 200) * ANIM_EVERY:
                self.state = random.choice(["idle", "sit", "idle"])
                self.state_timer = 0

        elif self.state == "idle":
            self.set_sprite(STAND)
            self.state_timer += 1
            if self.state_timer > random.randint(40, 120) * ANIM_EVERY:
                self.state = "walk"
                self.state_timer = 0
                if random.random() < 0.5:
                    self.direction *= -1

        elif self.state == "sit":
            # ab und zu nach oben schauen
            if self.state_timer % (20 * ANIM_EVERY) < 4 * ANIM_EVERY:
                self.set_sprite(SIT_LOOK_UP)
            else:
                self.set_sprite(SIT)

            self.state_timer += 1
            if self.state_timer > random.randint(60, 150) * ANIM_EVERY:
                self.state = "walk"
                self.state_timer = 0
                if random.random() < 0.5:
                    self.direction *= -1

        self.anim_tick += 1
        self.root.geometry(f"{PET_SIZE}x{PET_SIZE}+{int(self.x)}+{int(self.y)}")
        self.root.after(TICK_MS, self.update)

    # ------------------------------------------------------------
    # Maus-Events
    # ------------------------------------------------------------
    def on_mouse_down(self, event):
        self.drag_offset_x = event.x
        self.drag_offset_y = event.y
        self.was_dragged = False
        self.walk_frame = 0
        self.prev_x, self.prev_y = self.x, self.y
        self.drag_history.clear()
        self.drag_history.append((time.time(), self.x, self.y))

    def on_mouse_drag(self, event):
        self.state = "drag"
        self.was_dragged = True
        self.x = self.root.winfo_x() + event.x - self.drag_offset_x
        self.y = self.root.winfo_y() + event.y - self.drag_offset_y

        self.x = max(0, min(self.x, self.screen_w - PET_SIZE))
        self.y = max(0, min(self.y, self.screen_h - PET_SIZE))

        self.root.geometry(f"{PET_SIZE}x{PET_SIZE}+{int(self.x)}+{int(self.y)}")
        self.drag_history.append((time.time(), self.x, self.y))

    def on_mouse_up(self, event):
        if self.was_dragged:
            vx, vy = self.compute_throw_velocity()
            if abs(vx) > THROW_MIN_SPEED or abs(vy) > THROW_MIN_SPEED:
                self.vx = max(-THROW_MAX_SPEED, min(vx, THROW_MAX_SPEED))
                self.vy = max(-THROW_MAX_SPEED, min(vy, THROW_MAX_SPEED))
                self.state = "thrown"
            elif self.y < self.ground_y:
                self.state = "fall"
            else:
                self.state = "walk"
        else:
            self.state = "cheer"
        self.state_timer = 0
        self.walk_frame = 0

    def compute_throw_velocity(self):
        """Schätzt die Wurfgeschwindigkeit (Pixel/Tick) aus der Mausbewegung
        kurz vor dem Loslassen."""
        if len(self.drag_history) < 2:
            return 0.0, 0.0

        t1, x1, y1 = self.drag_history[0]
        t2, x2, y2 = self.drag_history[-1]
        dt = t2 - t1
        if dt <= 0:
            return 0.0, 0.0

        vx = (x2 - x1) / dt * (TICK_MS / 1000)
        vy = (y2 - y1) / dt * (TICK_MS / 1000)
        return vx, vy

    def on_right_click(self, event):
        menu = tk.Menu(self.root, tearoff=0)
        menu.add_command(label="Mit Childe reden", command=self.open_chat)
        menu.add_separator()
        menu.add_command(label="Beenden", command=self.root.destroy)
        menu.tk_popup(event.x_root, event.y_root)

    # ------------------------------------------------------------
    # Chat mit lokaler KI (llama-cpp-python)
    # ------------------------------------------------------------
    def open_chat(self):
        if self.chat_win is not None:
            try:
                self.chat_win.destroy()
            except tk.TclError:
                pass

        win = tk.Toplevel(self.root)
        win.title("Mit Childe reden")
        win.attributes("-topmost", True)
        win.resizable(False, False)

        x = int(self.x)
        y = max(0, int(self.y) - 90)
        win.geometry(f"320x80+{x}+{y}")

        entry_frame = tk.Frame(win)
        entry_frame.pack(fill="x", padx=8, pady=(12, 4))

        entry = tk.Entry(entry_frame, font=("Segoe UI", 11))
        entry.pack(side="left", fill="x", expand=True)
        entry.focus_force()

        def submit(event=None):
            text = entry.get().strip()
            if text:
                win.destroy()
                self.chat_win = None
                self.send_message(text)

        entry.bind("<Return>", submit)
        entry.bind("<Escape>", lambda e: win.destroy())

        tk.Button(win, text="Senden", command=submit).pack(pady=2)

        self.chat_win = win

    def send_message(self, text):
        self.show_bubble("...")
        threading.Thread(target=self._ask_llm_thread, args=(text,), daemon=True).start()

    def _ask_llm_thread(self, text):
        try:
            reply = ask_childe(text)
        except Exception:
            reply = (
                "Ich kann gerade nicht antworten - das lokale Modell konnte "
                "nicht geladen werden (siehe requirements.txt)."
            )
        self.root.after(0, lambda: self.show_bubble(reply))

    def show_bubble(self, text):
        self.close_bubble()

        win = tk.Toplevel(self.root)
        win.overrideredirect(True)
        win.attributes("-topmost", True)

        label = tk.Label(
            win,
            text=text,
            font=("Segoe UI", 10),
            bg="#fffdf5",
            fg="#222222",
            wraplength=220,
            justify="left",
            padx=10,
            pady=8,
            relief="solid",
            bd=1,
        )
        label.pack()

        win.update_idletasks()
        w = win.winfo_width()
        h = win.winfo_height()
        x = int(self.x + PET_SIZE / 2 - w / 2)
        y = int(self.y) - h - 6
        x = max(0, min(x, self.screen_w - w))
        y = max(0, y)
        win.geometry(f"+{x}+{y}")

        win.bind("<Button-1>", lambda e: self.close_bubble())
        label.bind("<Button-1>", lambda e: self.close_bubble())

        self.bubble_win = win

        if text != "...":
            duration = max(3000, min(15000, len(text) * 70))
            self.bubble_after_id = self.root.after(duration, self.close_bubble)

    def close_bubble(self):
        if self.bubble_after_id is not None:
            self.root.after_cancel(self.bubble_after_id)
            self.bubble_after_id = None
        if self.bubble_win is not None:
            try:
                self.bubble_win.destroy()
            except tk.TclError:
                pass
            self.bubble_win = None


if __name__ == "__main__":
    DesktopPet()
