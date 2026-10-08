declare namespace App {
  interface Locals {
    // the hashed device behind this request (8 hex), null before it has a cookie
    who: string | null;
  }
}
