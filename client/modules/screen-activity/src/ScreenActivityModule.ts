import { NativeModule, requireNativeModule } from 'expo';

declare class ScreenActivityModule extends NativeModule<{}> {}

export default requireNativeModule<ScreenActivityModule>('ScreenActivity');
