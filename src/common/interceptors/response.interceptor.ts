import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  status: boolean;
  message: string;
  data: T;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    return next.handle().pipe(
      map((data) => {
        // If the data is already in the { status, message, data } format, return it as is
        if (
          data &&
          typeof data === 'object' &&
          'status' in data &&
          typeof data.status === 'boolean'
        ) {
          // Ensure defaults if missing
          if (!data.message) data.message = 'Success';
          return data;
        }

        // Otherwise wrap it
        return {
          status: true,
          message: 'Success',
          data: data,
        };
      }),
    );
  }
}
