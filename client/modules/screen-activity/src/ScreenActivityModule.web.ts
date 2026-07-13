import { registerWebModule, NativeModule } from 'expo';

class ScreenActivityModule extends NativeModule<{}> {}

export default registerWebModule(ScreenActivityModule, 'ScreenActivityModule');
