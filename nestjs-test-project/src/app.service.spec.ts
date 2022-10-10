import { AppService } from './app.service';

describe('AppService', () => {
  let appService: AppService;

  beforeEach(() => {
    appService = new AppService();
  });

  test('getHello', () => {
    expect(appService.getHello()).toBe('Hello World!');
  });
});
