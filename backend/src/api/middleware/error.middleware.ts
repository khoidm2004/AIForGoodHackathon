import { Request, Response, NextFunction } from "express";

export function errorMiddleware(err: Error, req: Request, res: Response, next: NextFunction): void {
  console.error(err.message);
  res.status(500).json({ success: false, error: err.message });
}
