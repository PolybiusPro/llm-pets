import koffi from "koffi";

const libc = koffi.load("libc.so.6");

const Winsize = koffi.struct("winsize", {
  ws_row: "ushort",
  ws_col: "ushort",
  ws_xpixel: "ushort",
  ws_ypixel: "ushort"
});

const ioctl = libc.func("int ioctl(int fd, unsigned long request, void *)");
const flock = libc.func("int flock(int fd, int operation)");

const posixOpenpt = libc.func("int posix_openpt(int flags)");
const grantpt = libc.func("int grantpt(int fd)");
const unlockpt = libc.func("int unlockpt(int fd)");
const ptsname = libc.func("str ptsname(int fd)");
const open = libc.func("int open(const char *path, int flags)");

const TIOCGWINSZ = 0x5413;
const TIOCSWINSZ = 0x5414;
const O_RDWR = 2;
const O_NOCTTY = 256;
const LOCK_EX = 2;
const LOCK_NB = 4;

export function tryFlockExclusive(fd: number): boolean {
  return flock(fd, LOCK_EX | LOCK_NB) === 0;
}

export function terminalSize(fd: number): { rows: number; columns: number } {
  const size = Buffer.alloc(koffi.sizeof(Winsize));
  const result = ioctl(fd, TIOCGWINSZ, size);
  if (result !== 0) {
    throw new Error("TIOCGWINSZ failed");
  }
  const decoded = koffi.decode(size, Winsize) as { ws_row: number; ws_col: number };
  return { rows: decoded.ws_row, columns: decoded.ws_col };
}

export function setTerminalSize(fd: number, rows: number, columns: number): void {
  const size = Buffer.alloc(8);
  size.writeUInt16LE(rows, 0);
  size.writeUInt16LE(columns, 2);
  const result = ioctl(fd, TIOCSWINSZ, size);
  if (result !== 0) {
    throw new Error("TIOCSWINSZ failed");
  }
}

export function openPty(): { master: number; slave: number } {
  const master = posixOpenpt(O_RDWR | O_NOCTTY);
  if (master < 0) {
    throw new Error("posix_openpt failed");
  }
  if (grantpt(master) !== 0 || unlockpt(master) !== 0) {
    throw new Error("grantpt/unlockpt failed");
  }
  const name = ptsname(master);
  const slave = open(name, O_RDWR | O_NOCTTY);
  if (slave < 0) {
    throw new Error("open slave pty failed");
  }
  return { master, slave };
}
