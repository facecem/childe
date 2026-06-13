

import os
import sys
import io
import time
import random
from collections import deque

from PIL import Image, ImageOps

import objc
from Foundation import NSObject, NSMakeRect, NSMakePoint, NSData
from AppKit import (
    NSApplication, NSApp, NSWindow, NSView, NSImage, NSColor, NSScreen,
    NSEvent, NSTimer, NSRectFill,
    NSBackingStoreBuffered, NSFloatingWindowLevel,
    NSApplicationActivationPolicyAccessory,
)
from PyObjCTools import AppHelper

try:
    from AppKit import NSCompositingOperationSourceOver as COMPOSITE_OVER
except ImportError:
    from AppKit import NSCompositeSourceOver as COMPOSITE_OVER

try:
    from AppKit import (
        NSWindowCollectionBehaviorCanJoinAllSpaces,
        NSWindowCollectionBehaviorStationary,
    )
    COLLECTION_BEHAVIOR = (
        NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorStationary
    )
except ImportError:
    COLLECTION_BEHAVIOR = (1 << 0) | (1 << 4)


PET_SIZE = 110
GROUND_OFFSET = 60      # Abstand vom unteren Bildschirmrand (Dock)

TICK_S = 0.03            # Update-Intervall in Sekunden
ANIM_EVERY = 4
WALK_SPEED = 0.5
FALL_GRAVITY = 1.5
FALL_MAX_SPEED = 22

THROW_MIN_SPEED = 3
THROW_MAX_SPEED = 40
WALL_BOUNCE_DAMPING = 0.5
GROUND_BOUNCE_DAMPING = 0.45
GROUND_BOUNCE_MIN = 1.5

DRAG_WIGGLE_THRESHOLD = 1.5


def resource_path(relative):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, relative)


SPRITE_DIR = resource_path("sprites")

WALK_CYCLE = ["shime1.png", "shime2.png", "shime1.png", "shime3.png"]
STAND = "shime1.png"
SIT = "shime11.png"
SIT_LOOK_UP = "shime26.png"
FALL = "shime4.png"
CHEER = "shime46.png"
DRAG_CYCLE = ["shime5.png", "shime6.png", "shime7.png", "shime8.png", "shime9.png", "shime10.png"]


def _load_ns_image(name, mirror):
    path = os.path.join(SPRITE_DIR, name)
    img = Image.open(path).convert("RGBA")
    img = img.resize((PET_SIZE, PET_SIZE), Image.LANCZOS)

    # Alpha hart auf an/aus setzen, damit keine halbtransparenten
    # Kantenpixel mit dem Hintergrund verschwimmen (rosa Rand).
    r, g, b, alpha = img.split()
    alpha = alpha.point(lambda a: 255 if a > 128 else 0)
    img = Image.merge("RGBA", (r, g, b, alpha))

    if mirror:
        img = ImageOps.mirror(img)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    raw = buf.getvalue()
    data = NSData.dataWithBytes_length_(raw, len(raw))
    return NSImage.alloc().initWithData_(data)


class PetView(NSView):

    def drawRect_(self, rect):
        NSColor.clearColor().set()
        NSRectFill(rect)
        image = getattr(self, "image", None)
        if image is not None:
            size = image.size()
            image.drawInRect_fromRect_operation_fraction_(
                self.bounds(), NSMakeRect(0, 0, size.width, size.height),
                COMPOSITE_OVER, 1.0
            )

    def setImage_(self, image):
        self.image = image
        self.setNeedsDisplay_(True)

    def mouseDown_(self, event):
        self.pet.on_mouse_down(event)

    def mouseDragged_(self, event):
        self.pet.on_mouse_drag(event)

    def mouseUp_(self, event):
        self.pet.on_mouse_up(event)

    def rightMouseDown_(self, event):
        self.pet.on_right_click(event)


class DesktopPet(NSObject):

    def start(self):
        screen = NSScreen.mainScreen().frame()
        self.screen_w = screen.size.width
        self.screen_h = screen.size.height

        self.x = float(random.randint(0, int(self.screen_w - PET_SIZE)))
        self.ground_y = float(GROUND_OFFSET)
        self.y = self.ground_y

        self.direction = random.choice([-1, 1])
        self.speed = WALK_SPEED

        self.state = "walk"       # walk, idle, sit, fall, drag, cheer, thrown
        self.state_timer = 0
        self.walk_frame = 0
        self.anim_tick = 0
        self.fall_speed = 0.0
        self.vx = 0.0
        self.vy = 0.0
        self.drag_history = deque(maxlen=5)
        self.was_dragged = False
        self.prev_x, self.prev_y = self.x, self.y

        frame = NSMakeRect(self.x, self.y, PET_SIZE, PET_SIZE)
        self.window = NSWindow.alloc().initWithContentRect_styleMask_backing_defer_(
            frame, 0, NSBackingStoreBuffered, False
        )
        self.window.setOpaque_(False)
        self.window.setBackgroundColor_(NSColor.clearColor())
        self.window.setHasShadow_(False)
        self.window.setLevel_(NSFloatingWindowLevel)
        self.window.setCollectionBehavior_(COLLECTION_BEHAVIOR)
        self.window.setIgnoresMouseEvents_(False)

        self.view = PetView.alloc().initWithFrame_(NSMakeRect(0, 0, PET_SIZE, PET_SIZE))
        self.view.pet = self
        self.view.image = None
        self.window.setContentView_(self.view)
        self.window.makeKeyAndOrderFront_(None)

        self.sprites = self.load_sprites()
        self.set_sprite(STAND)

        self.timer = NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(
            TICK_S, self, "tick:", None, True
        )

    def tick_(self, timer):
        self.update()

    # ------------------------------------------------------------
    # Sprites laden
    # ------------------------------------------------------------
    def load_sprites(self):
        names = set(WALK_CYCLE) | set(DRAG_CYCLE) | {STAND, SIT, SIT_LOOK_UP, FALL, CHEER}
        sprites = {}
        for name in names:
            sprites[name] = {
                -1: _load_ns_image(name, mirror=False),
                1: _load_ns_image(name, mirror=True),
            }
        return sprites

    def set_sprite(self, name):
        self.view.setImage_(self.sprites[name][self.direction])

    def set_window_position(self):
        self.window.setFrameOrigin_(NSMakePoint(self.x, self.y))

    # ------------------------------------------------------------
    # Verhalten / Update-Schleife
    # (Cocoa-Koordinaten: Ursprung unten links, y wächst nach oben)
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
            self.y -= self.fall_speed
            self.set_sprite(FALL)
            if self.y <= self.ground_y:
                self.y = self.ground_y
                self.fall_speed = 0.0
                self.state = "walk"
                self.state_timer = 0

        elif self.state == "thrown":
            self.vy = max(self.vy - FALL_GRAVITY, -FALL_MAX_SPEED)
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
            if self.y <= self.ground_y:
                self.y = self.ground_y
                if self.vy < -GROUND_BOUNCE_MIN:
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
        self.set_window_position()

    # ------------------------------------------------------------
    # Maus-Events
    # ------------------------------------------------------------
    def on_mouse_down(self, event):
        self.drag_anchor = event.locationInWindow()
        self.was_dragged = False
        self.walk_frame = 0
        self.prev_x, self.prev_y = self.x, self.y
        self.drag_history.clear()
        self.drag_history.append((time.time(), self.x, self.y))

    def on_mouse_drag(self, event):
        self.state = "drag"
        self.was_dragged = True

        mouse_loc = NSEvent.mouseLocation()
        new_x = mouse_loc.x - self.drag_anchor.x
        new_y = mouse_loc.y - self.drag_anchor.y

        self.x = max(0.0, min(new_x, self.screen_w - PET_SIZE))
        self.y = max(0.0, min(new_y, self.screen_h - PET_SIZE))

        self.set_window_position()
        self.drag_history.append((time.time(), self.x, self.y))

    def on_mouse_up(self, event):
        if self.was_dragged:
            vx, vy = self.compute_throw_velocity()
            if abs(vx) > THROW_MIN_SPEED or abs(vy) > THROW_MIN_SPEED:
                self.vx = max(-THROW_MAX_SPEED, min(vx, THROW_MAX_SPEED))
                self.vy = max(-THROW_MAX_SPEED, min(vy, THROW_MAX_SPEED))
                self.state = "thrown"
            elif self.y > self.ground_y:
                self.state = "fall"
            else:
                self.state = "walk"
        else:
            self.state = "cheer"
        self.state_timer = 0

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

        vx = (x2 - x1) / dt * TICK_S
        vy = (y2 - y1) / dt * TICK_S
        return vx, vy

    def on_right_click(self, event):
        NSApp.terminate_(None)


def main():
    app = NSApplication.sharedApplication()
    app.setActivationPolicy_(NSApplicationActivationPolicyAccessory)

    pet = DesktopPet.alloc().init()
    pet.start()

    app.activateIgnoringOtherApps_(True)
    AppHelper.runEventLoop()


if __name__ == "__main__":
    main()
