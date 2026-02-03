export default class AsyncOptional<T> {
  private constructor(
    private readonly promise: Promise<T | null | undefined>,
  ) {}

  static of<T>(promise: Promise<T | null | undefined>): AsyncOptional<T> {
    return new AsyncOptional(promise);
  }

  static ofNullable<T>(value: T | null | undefined): AsyncOptional<T> {
    return new AsyncOptional(Promise.resolve(value));
  }

  map<U>(mapper: (value: T) => U): AsyncOptional<U> {
    return new AsyncOptional(
      this.promise.then((v) => (v != null ? mapper(v) : null)),
    );
  }

  flatMap<U>(mapper: (value: T) => Promise<U | null>): AsyncOptional<U> {
    return new AsyncOptional(
      this.promise.then((v) => (v != null ? mapper(v) : null)),
    );
  }

  filter(predicate: (value: T) => boolean): AsyncOptional<T> {
    return new AsyncOptional(
      this.promise.then((v) => (v != null && predicate(v) ? v : null)),
    );
  }

  async orElseThrow<E extends Error>(errorSupplier: () => E): Promise<T> {
    const value = await this.promise;
    if (value == null) throw errorSupplier();
    return value;
  }

  async orElse(defaultValue: T): Promise<T> {
    const value = await this.promise;
    return value ?? defaultValue;
  }

  async orElseGet(supplier: () => T | Promise<T>): Promise<T> {
    const value = await this.promise;
    return value ?? supplier();
  }

  async ifPresent(consumer: (value: T) => void | Promise<void>): Promise<void> {
    const value = await this.promise;
    if (value != null) await consumer(value);
  }
}
