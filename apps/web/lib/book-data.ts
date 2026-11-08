// El armado del libro vive en @mirai/domain (packages/domain/src/book-data.ts). El navegador lee el libro por la API
// (GET /v1/books/:b/snapshot, features/book/use-book-data.ts).
export * from "@mirai/domain/book-data"
